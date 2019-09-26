import * as fs from 'fs';

import { URL, Loader, System } from 'requirex';
import { minify as uglify } from 'uglify-js';

export { Installer } from './Installer';

export interface PackageJson {
	[key: string]: any;
	name: string;
	version?: string;
	main?: string;
	module?: string;
	browser?: string;
	typings?: string;
}

export interface PackagesConfig {
	basePath: string;
	scope?: string;
	copyFiles?: { [targetPath: string]: string };
	// TODO: Also allow inline template.
	packageTemplate?: string;
	// TODO: Also allow inline template.
	tsconfigTemplate?: string;
	tsconfigPaths?: {
		referencesIn?: string,
		referencesOut?: string
	};
	rollupConfig?: string;
	bundlePath?: string;
	bundleMinPath?: string;
	packages: { [name: string]: Object };
}

export interface RollupWarning {
	code: string;
	message: string;
	url: string;
	pos: number;
	loc: { file: string, line: number, column: number };
	frame: string;
	id: string;
}

const resolver = new Loader(System.getConfig());

resolver.config({
	baseURL: URL.fromLocal(process.cwd()).replace(/([^/]|^)$/, "$1/"),
	mainFields: ["module", "main"]
});

export function resolve(name: string, base: string) {
	return resolver.resolve(name, base && URL.fromLocal(base)).then(
		(key: string) => URL.toLocal(key)
	);
}

export function minify(code: string, path: string) {
	fs.writeFileSync(path, uglify(code).code, 'utf-8');
	return code;
}

export function onwarn(warning: RollupWarning, warn: (warning: RollupWarning) => void) {
	const code = warning.code;

	if(
		code != 'CIRCULAR_DEPENDENCY' &&
		code != 'THIS_IS_UNDEFINED'
	) {
		warn(warning);
	}
}
