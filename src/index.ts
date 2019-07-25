import * as path from 'path';
import * as fs from 'fs';

import * as ts from 'typescript';
import { System, URL, assign, keys } from 'requirex';

export interface PackageJson {
	[key: string]: any;
	name: string;
	version?: string;
}

export interface PackagesConfig {
	basePath: string,
	scope?: string,
	copyFiles?: { [targetPath: string]: string },
	// TODO: Also allow inline template.
	packageTemplate?: string,
	// TODO: Also allow inline template.
	tsconfigTemplate?: string,
	tsconfigPaths?: string,
	packages: { [name: string]: Object }
}

const linkType = process.platform.substr(0, 3) == 'win' ? 'junction' : 'file';
const reDir = /\/$/;

const emptyPromise = Promise.resolve();
const latestMeta = { suggestedVersion: 'latest' };

function symlink(target: string, path: string) {
	return new Promise((resolve, reject) => {
		fs.symlink(
			target,
			path,
			linkType,
			(err: NodeJS.ErrnoException | null) => err ? reject(err) : resolve()
		);
	});
}

class Installer implements PackagesConfig {

	constructor(config: PackagesConfig) {
		this.basePath = config.basePath;
		this.scope = config.scope;
		this.packages = config.packages;
	}

	getFullName(name: string) {
		return (this.scope || '') + (this.scope && '/') + name;
	}

	readFile(name: string) {
		return new Promise(
			(
				resolve: (data: string) => void,
				reject: (err: NodeJS.ErrnoException) => void
			) => fs.readFile(
				path.resolve(this.basePath, name),
				'utf-8',
				(err: NodeJS.ErrnoException | null, data: string) => (
					err ? reject(err) : resolve(data)
				)
			)
		);
	}

	writeFile(path: string, data: String, result: any) {
		return new Promise(
			(
				resolve: (json: PackageJson) => void,
				reject: (err: NodeJS.ErrnoException) => void
			) => fs.writeFile(
				path, data, 'utf-8',
				(err: NodeJS.ErrnoException | null) => (
					err ? reject(err) : resolve(result)
				)
			)
		);
	}

	writePackage(name: string, json: PackageJson) {
		const { basePath, scope } = this;

		return this.writeFile(
			path.resolve(basePath, scope || '.', name, 'package.json'),
			JSON.stringify(json, null, '  ').replace(/\$NAME/g, name),
			json
		);
	}

	applyPackageTemplate(packageTemplate?: string) {
		const { packages } = this;

		if(!packageTemplate) {
			// TODO: Maybe read existing package configs to packageTbl?
			return emptyPromise;
		}

		return this.readFile(packageTemplate).then((data: string) => {
			const template = JSON.parse(data);

			for(let name of Object.keys(packages)) {
				const fullName = this.getFullName(name);
				const json: PackageJson = { name: fullName };

				assign(json, packages[name], -1);
				assign(json, template, -1);

				this.packageTbl[fullName] = this.writePackage(name, json);
			}
		});
	}

	getTsconfigTemplate(tsconfigTemplate?: string) {
		if(!tsconfigTemplate) return emptyPromise;

		return this.readFile(tsconfigTemplate).then((data: string) => {
			this.tsconfigContent = JSON.parse(data);
		});
	}

	addPackageDeps(prefix: '~' | '^' | '' = '~') {
		const { basePath, scope, packages } = this;

		for(let name of Object.keys(packages)) {
			const fullName = this.getFullName(name);
			const jsonReady = this.packageTbl[fullName];
			let json: PackageJson;

			if(!jsonReady) continue;

			jsonReady.then((pkg: PackageJson) => {
				json = pkg;
				return System.analyze(fullName, URL.fromLocal(basePath) + '/');
			}).then((result) => {
				let tsconfig: { [key: string]: any } | undefined;
				let refList: { path: string }[] | undefined;

				if(this.tsconfigContent) {
					tsconfig = {};

					assign(tsconfig, this.tsconfigContent);
					refList = tsconfig.references || (tsconfig.references = []);
				}

				for(let dep of keys(result)) {
					const meta = System.manager.packageMetaTbl[dep] || latestMeta;

					if(dep != fullName) {
						const depTbl = json.dependencies || (json.dependencies = {});

						depTbl[dep] = meta.suggestedVersion || prefix + meta.lockedVersion;

						if(refList) {
							refList.push({ path: path.relative(
								path.dirname('/' + fullName + '/' + this.tsconfigPaths),
								'/' + dep + '/' + this.shortConfigPaths
							) });
						}
					}
				}

				this.writePackage(name, json);

				if(tsconfig && this.tsconfigPaths) {
					fs.writeFile(
						path.resolve(basePath, scope || '.', name, this.tsconfigPaths),
						JSON.stringify(tsconfig, null, '\t') + '\n',
						'utf-8',
						(err: NodeJS.ErrnoException | null) => { }
					);
				}
			});
		}
	}

	packageTbl: { [name: string]: Promise<PackageJson> } = {};

	tsconfigContent?: Object;
	shortConfigPaths?: string;

	basePath: string;
	scope?: string;
	tsconfigPaths?: string;
	packages: { [name: string]: Object }

}


if(process.argv[2] == 'install') {
	const confPath = path.resolve('packages.json');

	const json: PackagesConfig = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
	let {
		basePath,
		scope,
		copyFiles,
		packageTemplate,
		tsconfigTemplate,
		tsconfigPaths,
		packages
	} = json;

	let shortConfigPaths: string;

	json.basePath = path.resolve(path.dirname(confPath), basePath || '.');
	basePath = json.basePath;

	const links = ['node_modules'];

	if(scope) links.push(scope);

	Promise.all(links.map((name: string) => symlink('.', path.resolve(basePath, name)))).catch(() => { });

	if(copyFiles) {
		for(let dst of Object.keys(copyFiles)) {
			const src = copyFiles[dst];

			fs.readFile(path.resolve(basePath, src), (err: NodeJS.ErrnoException | null, buf: Buffer) => {
				if(err) return;
				for(let name of Object.keys(packages)) {
					fs.writeFile(path.resolve(basePath, scope || '.', name, dst), buf, () => { });
				}
			});
		}
	}

	if(tsconfigPaths) {
		if(!reDir.test(tsconfigPaths)) {
			for(let name of Object.keys(packages)) {
				try {
					if(fs.statSync(path.resolve(basePath, scope || '.', name, tsconfigPaths)).isDirectory()) {
						tsconfigPaths += '/';
						break;
					}
				} catch(err) { }
			}
		}

		if(reDir.test(tsconfigPaths)) {
			tsconfigPaths += 'tsconfig.json';
		} else if(!/\.json$/.test(tsconfigPaths)) {
			tsconfigPaths += '.json';
		}

		shortConfigPaths = tsconfigPaths.replace(/\/tsconfig.json$/, '');
		const references: string[] = [];

		for(let name of Object.keys(packages)) {
			references.push('{ "path": "' + name + '/' + shortConfigPaths + '" }');
		}

		const buildConfig = ('{' +
			'\n\t"references": [' +
			'\n\t\t' + references.join(',\n\t\t') +
			'\n\t],' +
			'\n\t"files": []' +
			'\n}\n'
		);

		fs.writeFile(
			path.resolve(basePath, 'tsconfig.json'),
			buildConfig,
			'utf-8',
			(err: NodeJS.ErrnoException | null) => { }
		);
	}

	const installer = new Installer(json);

	installer.tsconfigPaths = tsconfigPaths;
	installer.shortConfigPaths = shortConfigPaths;

	Promise.all([
		installer.applyPackageTemplate(packageTemplate),
		installer.getTsconfigTemplate(tsconfigTemplate)
	]).then(() => {
		const parseConfigHost: ts.ParseConfigHost = {
			fileExists: ts.sys.fileExists,
			readDirectory: ts.sys.readDirectory,
			readFile: ts.sys.readFile,
			useCaseSensitiveFileNames: true
		};

		for(let name of Object.keys(packages)) {
			const { options, fileNames } = ts.parseJsonConfigFileContent(
				installer.tsconfigContent,
				parseConfigHost,
				path.dirname(path.resolve(basePath, 'node_modules', scope || '.', name, installer.tsconfigPaths!))
			);

			options.declaration = false;
			options.sourceMap = false;

			const host: ts.LanguageServiceHost = {
				getCompilationSettings: () => options,
				getScriptFileNames: () => fileNames,
				getScriptVersion: (key: string) => '0',
				getCurrentDirectory: ts.sys.getCurrentDirectory,
				getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
				getScriptSnapshot: (key: string) => !fs.existsSync(key) ? void 0 : (
					ts.ScriptSnapshot.fromString(fs.readFileSync(key, 'utf-8'))
				)
			};

			const service = ts.createLanguageService(host, ts.createDocumentRegistry());

			for(let key of fileNames) {
				for(let output of service.getEmitOutput(key).outputFiles) {
					System.record(URL.fromLocal(output.name), output.text);
				}
			}
		}

		return installer.addPackageDeps()
	});
}
