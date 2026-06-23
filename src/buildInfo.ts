declare const __HASHLAKE_PHASE__: string;
declare const __HASHLAKE_COMMIT__: string;
declare const __HASHLAKE_BUILD_TIME__: string;

export const BUILD_INFO = {
  phase: __HASHLAKE_PHASE__,
  commit: __HASHLAKE_COMMIT__,
  builtAt: __HASHLAKE_BUILD_TIME__,
} as const;
