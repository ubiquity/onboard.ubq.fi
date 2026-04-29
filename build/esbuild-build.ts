import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { config } from "dotenv";
import esbuild from "esbuild";
import yamlPluginPackage from "esbuild-plugin-yaml";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { invertColors } from "./plugins/invert-colors.ts";

// Ensure output directory exists
const outDir = join("static/dist");
const require = createRequire(import.meta.url);

async function ensureOutDir() {
  try {
    await mkdir(outDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create output directory:", err);
    process.exit(1);
  }
}

import { pwaManifest } from "./plugins/pwa-manifest.ts";
const { yamlPlugin } = yamlPluginPackage as typeof import("esbuild-plugin-yaml");
const typescriptEntries = ["static/scripts/onboarding/onboarding.ts"];
const cssEntries = ["static/style/style.css", "static/style/special.css"];
export const entries = [...typescriptEntries, ...cssEntries];

const commonJsBrowserPackages: esbuild.Plugin = {
  name: "common-js-browser-packages",
  setup(build) {
    // Deno's npm layout exposes a broken ESM sibling import in libsodium-wrappers.
    build.onResolve({ filter: /^libsodium-wrappers$/ }, () => ({
      path: require.resolve("libsodium-wrappers"),
    }));
  },
};

export const esBuildContext: esbuild.BuildOptions = {
  plugins: [commonJsBrowserPackages, invertColors, pwaManifest, yamlPlugin({})],
  sourcemap: true,
  entryPoints: entries,
  bundle: true,
  minify: false,
  loader: {
    ".png": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".eot": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
  },
  outdir: outDir,
  outbase: "static",
  absWorkingDir: process.cwd(),
  define: createEnvDefines(["SUPABASE_URL", "SUPABASE_ANON_KEY", "FRONTEND_URL"], {
    commitHash: execSync(`git rev-parse --short HEAD`).toString().trim(),
  }),
};

async function build() {
  // Create output directory before building
  await ensureOutDir();

  try {
    const result = await esbuild.build(esBuildContext);

    if (result.metafile) {
      const outputs = Object.keys(result.metafile.outputs);
      console.log("Outputs:", outputs);

      // Verify files were written
      for (const output of outputs) {
        try {
          await access(output);
          console.log(`✓ Verified ${output}`);
        } catch (err) {
          console.error(`✗ Failed to write ${output}`);
          throw err;
        }
      }
    }
    console.log("\tesbuild complete");
  } catch (err) {
    console.error("Build failed:", err);
    if (err instanceof Error && "errors" in err) {
      console.error("Detailed errors:", JSON.stringify(err.errors, null, 2));
    }
    process.exit(1);
  }
}

build().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

function createEnvDefines(environmentVariables: string[], generatedAtBuild: Record<string, unknown>): Record<string, string> {
  const defines: Record<string, string> = {};
  config();
  for (const name of environmentVariables) {
    const envVar = process.env[name];
    if (!envVar) throw new Error("No envVar");
    defines[name] = JSON.stringify(envVar); // Use empty string as fallback
  }
  Object.keys(generatedAtBuild).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(generatedAtBuild, key)) {
      defines[key] = JSON.stringify(generatedAtBuild[key]);
    }
  });
  return defines;
}
