import resolve from "@rollup/plugin-node-resolve";
import cleanup from "rollup-plugin-cleanup";
// import commonjs from 'rollup-plugin-commonjs';
// import builtins from 'rollup-plugin-node-builtins';
// import globals from 'rollup-plugin-node-globals';
// import buble from "@rollup/plugin-buble";
import pkg from "./package.json";

export default [
	// browser-friendly IIFE build
	{
		input: pkg.module,
		output: {
			file: pkg.browser,
			format: "iife",
			sourcemap: true,
			intro: `/**
 * Leaflet.ImageOverlay.Arrugator by Iván Sánchez Ortega <ivan@sanchezortega.es> https://ivan.sanchezortega.es
 *
 * Licensed under GPLv3.
 *
 * Includes Iván Sánchez's Glii (under GPLv3, see https://gitlab.com/IvanSanchez/arrugator)
 *
 * Includes Vladimir Agafonkin's TinyQueue (under ISC, see https://github.com/mourner/tinyqueue)
 *
 */`,
		},
		plugins: [
			resolve(),
			cleanup({
				exclude: "src/**",
			}),
		],

		// 		external: ["fs", "path"],
	},
];
