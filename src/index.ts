import * as path from 'path';
import * as fs from 'fs';

const linkType = process.platform.substr(0, 3) == 'win' ? 'junction' : 'file';

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

if(process.argv[2] == 'install') {
	const confPath = path.resolve('packages.json');

	const json = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
	let { basePath, scope, copyFiles, tsconfigPaths, packages } = json;

	basePath = path.resolve(path.dirname(confPath), basePath || '.');

	const links = ['node_modules'];

	if(scope) links.push(scope);

	Promise.all(links.map((name: string) => symlink('.', path.resolve(basePath, name)))).catch(() => {});

	for(let dst of Object.keys(copyFiles)) {
		const src = copyFiles[dst];

		fs.readFile(path.resolve(basePath, src), (err: NodeJS.ErrnoException | null, buf: Buffer) => {
			for(let name of Object.keys(packages)) {
				fs.writeFile(path.resolve(basePath, scope || '.', name, dst), buf, () => {});
			}
		});
	}
}
