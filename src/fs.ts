import * as fs from 'fs';

export function promisify(
	proc: (handler: (err: NodeJS.ErrnoException | null) => void) => void
): Promise<void>;

export function promisify<Type>(
	proc: (handler: (err: NodeJS.ErrnoException | null, data: Type) => void) => void
): Promise<Type>;

export function promisify<Type>(
	proc: (
		handler: (
			err: NodeJS.ErrnoException | null,
			data?: Type
		) => void
	) => void
) {
	return new Promise(
		(
			resolve: (data: Type) => void,
			reject: (err: NodeJS.ErrnoException) => void
		) => proc(
			(
				err: NodeJS.ErrnoException | null,
				data?: Type
			) => err ? reject(err) : resolve(data as Type)
		)
	);
}

const linkType = process.platform.substr(0, 3) == 'win' ? 'junction' : 'file';

export function symlink(target: string, path: string) {
	return promisify((handler) =>
		fs.symlink(target, path, linkType, handler)
	);
}

export function writeFile(path: string, data: String | Buffer) {
	return promisify((handler) =>
		fs.writeFile(path, data, 'utf-8', handler)
	);
}
