import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { defineConfig } from '@playwright/test';
import matrix from './playwright.matrix.config';

/*
 * Renders the README device image. Run `pnpm build` first, then
 * `pnpm readme:image`; writes docs/images/devices.png.
 *
 * The server runs on a copy of the matrix fixture with the changes the image
 * needs, so the matrix itself keeps covering the defaults.
 */
const FIXTURE = 'matrix-output/readme-fixture';

// workers load this file too; only the main process prepares the fixture the server already reads
if (process.env.TEST_WORKER_INDEX === undefined) {
	rmSync(FIXTURE, { recursive: true, force: true });
	mkdirSync(FIXTURE, { recursive: true });
	cpSync('e2e/fixture-matrix/data', `${FIXTURE}/data`, { recursive: true });
	if (!existsSync(`${FIXTURE}/build`)) symlinkSync('../../build', `${FIXTURE}/build`);

	const hearth = readFileSync(`${FIXTURE}/data/hearth.yaml`, 'utf8')
		.replace('    type: clock\n', "    type: clock\n    hour_format: '24'\n")
		.replace('title: Header card', 'title: Welcome home')
		.replace('subtitle: A page header as a card', 'subtitle: Everyone is home')
		.replace('            - entity: sensor.broken\n', '');
	writeFileSync(`${FIXTURE}/data/hearth.yaml`, `${hearth}scroll_edge_blur: false\n`);
}

const [fakeHass, app] = matrix.webServer as NonNullable<typeof matrix.webServer>[];

export default defineConfig({
	...matrix,
	testDir: './e2e/readme',
	outputDir: './matrix-output/.playwright-readme',
	webServer: [fakeHass, { ...app, cwd: FIXTURE }]
});
