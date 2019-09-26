import * as path from 'path';
import * as fs from 'fs';

import { PackagesConfig, Installer } from '.';
import { symlink } from './fs';

if(process.argv[2] == 'install') {
	const confPath = path.resolve(process.argv[3] || 'packages.json');

	const json: PackagesConfig = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
	let {
		basePath,
		scope,
		copyFiles,
		packageTemplate,
		tsconfigTemplate,
		rollupConfig,
		bundlePath,
		bundleMinPath
	} = json;

	json.basePath = path.resolve(path.dirname(confPath), basePath || '.');

	const installer = new Installer(json);
	const links = ['node_modules'];

	if(scope) links.push(scope);

	Promise.all(links.map(
		(name: string) => symlink('.', path.resolve(basePath, name)).catch(() => {})
	)).then(() => (installer.createTsProject(), Promise.all([
		installer.makeCopies(copyFiles),
		installer.applyPackageTemplate(packageTemplate),
		installer.getTsconfigTemplate(tsconfigTemplate),
	]))).then(
		() => installer.transpile()
	).then(() => {
		installer.createRollupConfig(rollupConfig, bundlePath, bundleMinPath);

		return installer.addPackageDeps()
	});
}
