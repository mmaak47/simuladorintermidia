// ─── Cinematic Post-Processing Shader ───────────────────────
// Full-screen post-processing pass for subtle cinematic artifacts:
// bloom (pre-blurred input), vignette, film grain, chromatic aberration,
// highlight rolloff.

export const cinematicVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const cinematicFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uScene;         // main rendered scene
uniform sampler2D uBloomTexture;  // pre-blurred bright areas
uniform vec2 uResolution;
uniform float uTime;

// Effect intensities (0..1)
uniform float uBloomIntensity;
uniform float uVignetteIntensity;
uniform float uGrainIntensity;
uniform float uChromaticAberration;
uniform float uHighlightCompression;

varying vec2 vUv;

// Pseudo-random for grain
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 sampleWithCA(sampler2D tex, vec2 uv, float amount) {
  if (amount < 0.001) return texture2D(tex, uv).rgb;

  vec2 dir = (uv - 0.5) * amount * 0.01;
  float r = texture2D(tex, uv + dir).r;
  float g = texture2D(tex, uv).g;
  float b = texture2D(tex, uv - dir).b;
  return vec3(r, g, b);
}

void main() {
  // Chromatic aberration
  vec3 col = sampleWithCA(uScene, vUv, uChromaticAberration);

  // Bloom additive
  if (uBloomIntensity > 0.001) {
    vec3 bloom = texture2D(uBloomTexture, vUv).rgb;
    col += bloom * uBloomIntensity;
  }

  // Highlight compression (Reinhard-style)
  if (uHighlightCompression > 0.001) {
    col = col / (1.0 + col * uHighlightCompression);
  }

  // Vignette
  if (uVignetteIntensity > 0.001) {
    float dist = distance(vUv, vec2(0.5));
    float vig = smoothstep(0.45, 0.85, dist);
    col *= 1.0 - vig * uVignetteIntensity;
  }

  // Film grain
  if (uGrainIntensity > 0.001) {
    float grain = rand(vUv + fract(uTime)) * 2.0 - 1.0;
    col += grain * uGrainIntensity * 0.15;
  }

  // Clamp and output
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
