import { createManifest } from "./create-manifest";
import type { Plugin } from "vite";
import { transformWithEsbuild } from "vite";
import { createReactWrapper, createReactWrapperMetadata } from "./create-react";
import { createDts } from "./create-dts";
import path from "node:path";

const virtualModuleId = "virtual:web-components-react-bindings";
const resolvedVirtualModuleId = "\0" + virtualModuleId;

type PluginOptions = {
  // "../WebComponents/src/**/!(*.stories|*.test).ts"
  globToLitComponents: string,
  // custom- -> needs to be removed
  componentPrefix: string,
  // ("Button") => web-components/button/button or ../button/button -> seen from the virtual import file
  getComponentPath: (name: string) => string,
  // e.g. dist or build
  outPath: string,
  // e.g. src/react/index.ts
  virtualFileLocation: string
} & ({
  // is the virtual import in the same repo as the lit elements
  samePackageOutput: true
  srcPath: string,
  watchLitDist?: never,
} | {
  samePackageOutput: false,
  srcPath?: never,
  // e.g ../WebComponents/dist to automatically reload when the lit src changes
  watchLitDist: string
});

export default function vitePluginCreateLitReactWrapper(
  {
    globToLitComponents,
    componentPrefix,
    getComponentPath,
    watchLitDist,
    samePackageOutput,
    srcPath,
    virtualFileLocation,
    outPath = "./dist"
  }: PluginOptions): Plugin {
  return {
    name: "vite-plugin-generate-lit-react-wrapper",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      // if we generate the wrapper in the same package we need to resolve the relative paths to absolute ones
      if (samePackageOutput && id[0] === ".") {
        const flattenPath = id.replace(srcPath, "")
          .replace(/\.\.\//g, "");
        return path.join(process.cwd(), `${ srcPath }/${ flattenPath }.ts`);
      }
      return null;
    },
    load(this, id) {
      if (id === resolvedVirtualModuleId) {
        const manifest = createManifest(globToLitComponents);
        const metadata = createReactWrapperMetadata(manifest, componentPrefix, getComponentPath);
        const wrapper = createReactWrapper(metadata, componentPrefix);
        this.cache.set("wrapper", wrapper);
        return wrapper;
      }
      return null;
    },
    async transform(src, id) {
      if (id === resolvedVirtualModuleId) {
        watchLitDist && this.addWatchFile(watchLitDist);
        const { code, map } = await transformWithEsbuild(src, id, { loader: "ts" });

        return {
          code,
          map
        };
      }
      return null;
    },
    async closeBundle() {
      const wrapper = this.cache.get("wrapper");
      const path = samePackageOutput ? globToLitComponents : undefined;
      await createDts(wrapper, outPath, virtualFileLocation, path);
    }
  };
}