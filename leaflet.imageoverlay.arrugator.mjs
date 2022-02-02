// import { GLFactory as Glii } from "glii";

import { default as Glii } from "glii/src/GLFactory.mjs";
import {} from "glii/src/Texture.mjs";
import {} from "glii/src/Attribute/SingleAttribute.mjs";
import {} from "glii/src/Indices/IndexBuffer.mjs";
import {} from "glii/src/WebGL1Program.mjs";

import Arrugator from "arrugator";

/**
 * @class L.ImageOverlay.Arrugator
 *
 * Displays reprojected raster images.
 *
 * Leverages Glii for not going insane with the WebGL bits, and Arrugator for
 * calculating the triangle mesh for raster reprojection.
 *
 */

L.ImageOverlay.Arrugator = L.Layer.extend({
	options: {
		// @option padding: Number = 0.1
		// How much to extend the clip area around the map view (relative to its size)
		// e.g. 0.1 would be 10% of map view in each direction
		padding: 0.1,

		// @option epsilon: Number = 1000000
		// Target epsilon for the Arrugator triangle subdivision. Should be equal to the
		// *square* of the maximum error, in projected map units. The default equals
		// 1000 map units.
		epsilon: 1000000,

		// @option fragmentShader: String = "void main() { gl_FragColor = texture2D(uRaster, vUV); }"
		// A `String` containing the WebGL fragment shader to be used. The default
		// just samples the predefined `uRaster` texture with the predefined `vUV`
		// `vec2` varying.
		//
		// Do not change the default unless you know what a fragment shader is.
		fragmentShader: "void main() { gl_FragColor = texture2D(uRaster, vUV); }",
	},

	initialize: function initialize(url, opts) {
		this._src = url;

		// @option controlPoints: Array of Array of Number
		// An array of four pairs of coordinates,
		this._controlPoints = opts.controlPoints;
		if (!(this._controlPoints instanceof Array) || this._controlPoints.length !== 4) {
			throw new Error(
				"A L.ImageOverlay.Arrugator needs a 'controlPoints' option, which must be an array of four coordinates"
			);
		}

		// @option projector: Function
		// A `Function` that should take an `Array` of two numbers (coordinates in the
		// raster's original projection) and return an `Array` of two numbers
		// (coordinates in the Leaflet display projection).
		//
		// Typically this should be a proj4 forward projection function, like
		// `proj4(srcCRS, displayCRS).forward`
		//
		// It's up to the developer to ensure that the projector function is the adequate
		// for the CRSs.
		this._projector = opts.projector;
		if (!(this._projector instanceof Function)) {
			throw new Error(
				"A L.ImageOverlay.Arrugator needs a 'projector' option, which must be function for projecting coordinate pairs"
			);
		}

		L.Util.setOptions(this, opts);
	},

	onAdd: function onAdd() {
		if (!this._container) {
			this._initContainer();

			if (this._zoomAnimated) {
				L.DomUtil.addClass(this._container, "leaflet-zoom-animated");
			}
		}

		this.getPane().appendChild(this._container);
		this._reset();
	},

	onRemove: function onRemove() {
		this._destroyContainer();
	},

	getEvents: L.Renderer.prototype.getEvents,
	// 	_onAnimZoom: L.Renderer.prototype._onAnimZoom,
	_onAnimZoom: function (ev) {
		this._updateTransform(ev.center, ev.zoom);
		this._redraw();
	},
	// 	_onZoom: L.Renderer.prototype._onZoom,
	_onZoom: function (ev) {
		this._update();
		this._redraw();
	},
	_onZoomEnd: L.Util.falseFn,
	_updateTransform: L.Renderer.prototype._updateTransform,

	_initContainer: function _initContainer() {
		this._container = document.createElement("canvas");

		const glii = (this._glii = new Glii(this._container, {
			preMultipliedAlpha: false,
		}));

		const rasterTexture = new glii.Texture({
			minFilter: glii.LINEAR,
			maxFilter: glii.LINEAR,
		});
		const rasterImage = new Image();
		rasterImage.onload = () => {
			rasterTexture.texImage2D(rasterImage);
			this.fire("load");
			this._redraw();
		};

		rasterImage.src = this._src;

		let sourceUV = [
			[0, 0],
			[0, 1],
			[1, 0],
			[1, 1],
		];

		this._arrugator = new Arrugator(this._projector, this._controlPoints, sourceUV, [
			[0, 1, 3],
			[0, 3, 2],
		]);

		this._arrugator.lowerEpsilon(this.options.epsilon);

		let arrugado = this._arrugator.output();

		const pos = new glii.SingleAttribute({
			glslType: "vec2",
			size: arrugado.projected.length,
			growFactor: false,
		});
		const uv = new glii.SingleAttribute({
			glslType: "vec2",
			size: arrugado.uv.length,
			growFactor: false,
		});
		const trigs = (this._trigs = new glii.IndexBuffer({
			size: arrugado.trigs.length * 3,
			growFactor: false,
		}));

		pos.setBytes(0, 0, Float32Array.from(arrugado.projected.flat()));
		uv.setBytes(0, 0, Float32Array.from(arrugado.uv.flat()));
		trigs.set(0, arrugado.trigs.flat());

		this._program = new glii.WebGL1Program({
			vertexShaderSource: `
void main() {
	gl_Position = vec4(
		(aPos.xy - uCenter) / vec2(uScale),
		1.0,
		1.0
	);
	vUV = aUV;
}`,
			varyings: { vUV: "vec2" },
			fragmentShaderSource: this.options.fragmentShader,
			indexBuffer: this._trigs,
			attributes: {
				aPos: pos,
				aUV: uv,
			},
			textures: {
				uRaster: rasterTexture,
			},
			uniforms: {
				uCenter: "vec2",
				uScale: "vec2",
			},
		});
	},

	_destroyContainer: function _destroyContainer() {
		delete this._glii;
		L.DomUtil.remove(this._container);
		L.DomEvent.off(this._container);
		delete this._container;
	},

	_redraw: function _redraw(ev) {
		var crs = this._map.options.crs,
			projcenter = crs.project(this._center),
			mapPxSize = this._bounds.getSize(),
			scale = mapPxSize.divideBy(crs.scale(this._zoom) / 20037508);
		this._program.setUniform("uCenter", [projcenter.x, projcenter.y]);
		this._program.setUniform("uScale", [scale.x, scale.y]);
		this._program.run();
	},

	_update: function _update() {
		if (this._map._animatingZoom && this._bounds) {
			return;
		}
		L.Renderer.prototype._update.call(this);

		this._center = this._map.getCenter();
		this._zoom = this._map.getZoom();

		let m = L.Browser.retina ? 2 : 1,
			mapPxSize = this._bounds.getSize();
		// 		    mapPxSize = this._map.getSize();

		this._container.width = /*m * */ mapPxSize.x;
		this._container.height = /*m * */ mapPxSize.y;
		L.DomUtil.setPosition(this._container, this._bounds.min);

		this._redraw();
	},

	_reset: function () {
		this._update();
		this._updateTransform(this._center, this._zoom);
	},
});

L.imageOverlay.arrugator = function arrugator(url, opts) {
	return new L.ImageOverlay.Arrugator(url, opts);
};
