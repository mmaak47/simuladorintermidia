// ─── LED Screen Material ───────────────────────────────────
// Custom ShaderMaterial that renders an ad creative onto a quad
// with LED/LCD realism: nits brightness, pixel grid, angle falloff.

export const ledScreenVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ledScreenFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uCreativeTexture;
uniform float uNits;          // brightness in nits (100-2500)
uniform float uPixelGrid;     // 0..1 pixel-grid intensity
uniform float uAngleFalloff;  // 0 or 1 (enabled)
uniform vec2 uResolution;     // screen pixel resolution for grid

// Scene match uniforms
uniform float uExposureOffset;
uniform float uSaturation;
uniform float uTemperatureBias; // normalized -1..1
uniform float uHighlightCompress;

// UV fit uniforms
uniform vec2 uUvOffset;
uniform vec2 uUvScale;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

vec3 adjustTemperature(vec3 col, float bias) {
  // Simplified warm/cool shift
  col.r += bias * 0.04;
  col.b -= bias * 0.04;
  return col;
}

vec3 adjustSaturation(vec3 col, float sat) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(lum), col, sat);
}

float pixelGridMask(vec2 uv, vec2 res, float intensity) {
  if (intensity < 0.001) return 1.0;
  vec2 pixelCoord = uv * res;
  vec2 grid = abs(fract(pixelCoord) - 0.5) * 2.0;
  float mask = smoothstep(0.0, 0.15, min(grid.x, grid.y));
  return mix(1.0, mask, intensity);
}

void main() {
  // Apply UV fit (cover/contain)
  vec2 fitUv = vUv * uUvScale + uUvOffset;

  // Clamp to avoid repeating
  if (fitUv.x < 0.0 || fitUv.x > 1.0 || fitUv.y < 0.0 || fitUv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 texColor = texture2D(uCreativeTexture, fitUv);
  vec3 col = texColor.rgb;

  // Scene match adjustments
  col *= pow(2.0, uExposureOffset);
  col = adjustSaturation(col, uSaturation);
  col = adjustTemperature(col, uTemperatureBias);

  // Highlight compression (soft knee)
  col = col / (1.0 + col * uHighlightCompress);

  // Nits brightness scaling (HDR-like)
  float nitsScale = uNits / 200.0; // normalize to a reasonable display level
  col *= nitsScale;

  // Pixel grid overlay
  col *= pixelGridMask(vUv, uResolution, uPixelGrid);

  // Angle-based brightness falloff (Lambertian approximation)
  if (uAngleFalloff > 0.5) {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float ndotv = max(dot(vWorldNormal, viewDir), 0.0);
    // Subtle falloff — screens don't go to zero
    float falloff = mix(0.4, 1.0, pow(ndotv, 0.8));
    col *= falloff;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
