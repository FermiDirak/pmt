#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = [];
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![a-zA-Z]:[\\\/]|\\\\|\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
  ["chalk", new Map([
    ["2.4.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["escape-string-regexp", "1.0.5"],
        ["supports-color", "5.5.0"],
        ["chalk", "2.4.2"],
      ]),
    }],
  ])],
  ["ansi-styles", new Map([
    ["3.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/"),
      packageDependencies: new Map([
        ["color-convert", "1.9.3"],
        ["ansi-styles", "3.2.1"],
      ]),
    }],
  ])],
  ["color-convert", new Map([
    ["1.9.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
        ["color-convert", "1.9.3"],
      ]),
    }],
  ])],
  ["color-name", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
      ]),
    }],
  ])],
  ["escape-string-regexp", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
      ]),
    }],
  ])],
  ["supports-color", new Map([
    ["5.5.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
        ["supports-color", "5.5.0"],
      ]),
    }],
  ])],
  ["has-flag", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
      ]),
    }],
  ])],
  ["commander", new Map([
    ["2.20.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-commander-2.20.0-d58bb2b5c1ee8f87b0d340027e9e94e222c5a422/node_modules/commander/"),
      packageDependencies: new Map([
        ["commander", "2.20.0"],
      ]),
    }],
  ])],
  ["default-pager", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-default-pager-1.1.0-ed28895b04a96e37078bdc62239131971620eeec/node_modules/default-pager/"),
      packageDependencies: new Map([
        ["default-pager", "1.1.0"],
      ]),
    }],
  ])],
  ["git-commit-count", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-git-commit-count-1.1.3-1e9babc887c056a65afed58af9d84a209e6009e3/node_modules/git-commit-count/"),
      packageDependencies: new Map([
        ["execa", "0.6.3"],
        ["is-git-repository", "1.1.1"],
        ["path-is-absolute", "1.0.1"],
        ["git-commit-count", "1.1.3"],
      ]),
    }],
  ])],
  ["execa", new Map([
    ["0.6.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-execa-0.6.3-57b69a594f081759c69e5370f0d17b9cb11658fe/node_modules/execa/"),
      packageDependencies: new Map([
        ["cross-spawn", "5.1.0"],
        ["get-stream", "3.0.0"],
        ["is-stream", "1.1.0"],
        ["npm-run-path", "2.0.2"],
        ["p-finally", "1.0.0"],
        ["signal-exit", "3.0.2"],
        ["strip-eof", "1.0.0"],
        ["execa", "0.6.3"],
      ]),
    }],
    ["0.7.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-execa-0.7.0-944becd34cc41ee32a63a9faf27ad5a65fc59777/node_modules/execa/"),
      packageDependencies: new Map([
        ["cross-spawn", "5.1.0"],
        ["get-stream", "3.0.0"],
        ["is-stream", "1.1.0"],
        ["npm-run-path", "2.0.2"],
        ["p-finally", "1.0.0"],
        ["signal-exit", "3.0.2"],
        ["strip-eof", "1.0.0"],
        ["execa", "0.7.0"],
      ]),
    }],
  ])],
  ["cross-spawn", new Map([
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cross-spawn-5.1.0-e8bd0efee58fcff6f8f94510a0a554bbfa235449/node_modules/cross-spawn/"),
      packageDependencies: new Map([
        ["lru-cache", "4.1.5"],
        ["shebang-command", "1.2.0"],
        ["which", "1.3.1"],
        ["cross-spawn", "5.1.0"],
      ]),
    }],
    ["6.0.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
        ["path-key", "2.0.1"],
        ["semver", "5.7.0"],
        ["shebang-command", "1.2.0"],
        ["which", "1.3.1"],
        ["cross-spawn", "6.0.5"],
      ]),
    }],
  ])],
  ["lru-cache", new Map([
    ["4.1.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-lru-cache-4.1.5-8bbe50ea85bed59bc9e33dcab8235ee9bcf443cd/node_modules/lru-cache/"),
      packageDependencies: new Map([
        ["pseudomap", "1.0.2"],
        ["yallist", "2.1.2"],
        ["lru-cache", "4.1.5"],
      ]),
    }],
  ])],
  ["pseudomap", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pseudomap-1.0.2-f052a28da70e618917ef0a8ac34c1ae5a68286b3/node_modules/pseudomap/"),
      packageDependencies: new Map([
        ["pseudomap", "1.0.2"],
      ]),
    }],
  ])],
  ["yallist", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-yallist-2.1.2-1c11f9218f076089a47dd512f93c6699a6a81d52/node_modules/yallist/"),
      packageDependencies: new Map([
        ["yallist", "2.1.2"],
      ]),
    }],
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/"),
      packageDependencies: new Map([
        ["yallist", "3.0.3"],
      ]),
    }],
  ])],
  ["shebang-command", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
        ["shebang-command", "1.2.0"],
      ]),
    }],
  ])],
  ["shebang-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["which", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
        ["which", "1.3.1"],
      ]),
    }],
  ])],
  ["isexe", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
      ]),
    }],
  ])],
  ["get-stream", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/"),
      packageDependencies: new Map([
        ["get-stream", "3.0.0"],
      ]),
    }],
  ])],
  ["is-stream", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/"),
      packageDependencies: new Map([
        ["is-stream", "1.1.0"],
      ]),
    }],
  ])],
  ["npm-run-path", new Map([
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/"),
      packageDependencies: new Map([
        ["path-key", "2.0.1"],
        ["npm-run-path", "2.0.2"],
      ]),
    }],
  ])],
  ["path-key", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/"),
      packageDependencies: new Map([
        ["path-key", "2.0.1"],
      ]),
    }],
  ])],
  ["p-finally", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/"),
      packageDependencies: new Map([
        ["p-finally", "1.0.0"],
      ]),
    }],
  ])],
  ["signal-exit", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/"),
      packageDependencies: new Map([
        ["signal-exit", "3.0.2"],
      ]),
    }],
  ])],
  ["strip-eof", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/"),
      packageDependencies: new Map([
        ["strip-eof", "1.0.0"],
      ]),
    }],
  ])],
  ["is-git-repository", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-git-repository-1.1.1-c68e4b7a806422349aaec488973a90558d7e9be0/node_modules/is-git-repository/"),
      packageDependencies: new Map([
        ["execa", "0.6.3"],
        ["path-is-absolute", "1.0.1"],
        ["is-git-repository", "1.1.1"],
      ]),
    }],
  ])],
  ["path-is-absolute", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/"),
      packageDependencies: new Map([
        ["path-is-absolute", "1.0.1"],
      ]),
    }],
  ])],
  ["inquirer", new Map([
    ["6.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-inquirer-6.3.1-7a413b5e7950811013a3db491c61d1f3b776e8e7/node_modules/inquirer/"),
      packageDependencies: new Map([
        ["ansi-escapes", "3.2.0"],
        ["chalk", "2.4.2"],
        ["cli-cursor", "2.1.0"],
        ["cli-width", "2.2.0"],
        ["external-editor", "3.0.3"],
        ["figures", "2.0.0"],
        ["lodash", "4.17.11"],
        ["mute-stream", "0.0.7"],
        ["run-async", "2.3.0"],
        ["rxjs", "6.5.2"],
        ["string-width", "2.1.1"],
        ["strip-ansi", "5.2.0"],
        ["through", "2.3.8"],
        ["inquirer", "6.3.1"],
      ]),
    }],
  ])],
  ["ansi-escapes", new Map([
    ["3.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-escapes-3.2.0-8780b98ff9dbf5638152d1f1fe5c1d7b4442976b/node_modules/ansi-escapes/"),
      packageDependencies: new Map([
        ["ansi-escapes", "3.2.0"],
      ]),
    }],
  ])],
  ["cli-cursor", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cli-cursor-2.1.0-b35dac376479facc3e94747d41d0d0f5238ffcb5/node_modules/cli-cursor/"),
      packageDependencies: new Map([
        ["restore-cursor", "2.0.0"],
        ["cli-cursor", "2.1.0"],
      ]),
    }],
  ])],
  ["restore-cursor", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-restore-cursor-2.0.0-9f7ee287f82fd326d4fd162923d62129eee0dfaf/node_modules/restore-cursor/"),
      packageDependencies: new Map([
        ["onetime", "2.0.1"],
        ["signal-exit", "3.0.2"],
        ["restore-cursor", "2.0.0"],
      ]),
    }],
  ])],
  ["onetime", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-onetime-2.0.1-067428230fd67443b2794b22bba528b6867962d4/node_modules/onetime/"),
      packageDependencies: new Map([
        ["mimic-fn", "1.2.0"],
        ["onetime", "2.0.1"],
      ]),
    }],
  ])],
  ["mimic-fn", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/"),
      packageDependencies: new Map([
        ["mimic-fn", "1.2.0"],
      ]),
    }],
  ])],
  ["cli-width", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639/node_modules/cli-width/"),
      packageDependencies: new Map([
        ["cli-width", "2.2.0"],
      ]),
    }],
  ])],
  ["external-editor", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-external-editor-3.0.3-5866db29a97826dbe4bf3afd24070ead9ea43a27/node_modules/external-editor/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
        ["iconv-lite", "0.4.24"],
        ["tmp", "0.0.33"],
        ["external-editor", "3.0.3"],
      ]),
    }],
  ])],
  ["chardet", new Map([
    ["0.7.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e/node_modules/chardet/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
      ]),
    }],
  ])],
  ["iconv-lite", new Map([
    ["0.4.24", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
        ["iconv-lite", "0.4.24"],
      ]),
    }],
  ])],
  ["safer-buffer", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
      ]),
    }],
  ])],
  ["tmp", new Map([
    ["0.0.33", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9/node_modules/tmp/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
        ["tmp", "0.0.33"],
      ]),
    }],
  ])],
  ["os-tmpdir", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
      ]),
    }],
  ])],
  ["figures", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-figures-2.0.0-3ab1a2d2a62c8bfb431a0c94cb797a2fce27c962/node_modules/figures/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
        ["figures", "2.0.0"],
      ]),
    }],
  ])],
  ["lodash", new Map([
    ["4.17.11", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/"),
      packageDependencies: new Map([
        ["lodash", "4.17.11"],
      ]),
    }],
  ])],
  ["mute-stream", new Map([
    ["0.0.7", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mute-stream-0.0.7-3075ce93bc21b8fab43e1bc4da7e8115ed1e7bab/node_modules/mute-stream/"),
      packageDependencies: new Map([
        ["mute-stream", "0.0.7"],
      ]),
    }],
  ])],
  ["run-async", new Map([
    ["2.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0/node_modules/run-async/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
        ["run-async", "2.3.0"],
      ]),
    }],
  ])],
  ["is-promise", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa/node_modules/is-promise/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
      ]),
    }],
  ])],
  ["rxjs", new Map([
    ["6.5.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-rxjs-6.5.2-2e35ce815cd46d84d02a209fb4e5921e051dbec7/node_modules/rxjs/"),
      packageDependencies: new Map([
        ["tslib", "1.10.0"],
        ["rxjs", "6.5.2"],
      ]),
    }],
  ])],
  ["tslib", new Map([
    ["1.10.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a/node_modules/tslib/"),
      packageDependencies: new Map([
        ["tslib", "1.10.0"],
      ]),
    }],
  ])],
  ["string-width", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "2.0.0"],
        ["strip-ansi", "4.0.0"],
        ["string-width", "2.1.1"],
      ]),
    }],
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961/node_modules/string-width/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["strip-ansi", "5.2.0"],
        ["string-width", "3.1.0"],
      ]),
    }],
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/"),
      packageDependencies: new Map([
        ["code-point-at", "1.1.0"],
        ["is-fullwidth-code-point", "1.0.0"],
        ["strip-ansi", "3.0.1"],
        ["string-width", "1.0.2"],
      ]),
    }],
  ])],
  ["is-fullwidth-code-point", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "2.0.0"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["number-is-nan", "1.0.1"],
        ["is-fullwidth-code-point", "1.0.0"],
      ]),
    }],
  ])],
  ["strip-ansi", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "3.0.0"],
        ["strip-ansi", "4.0.0"],
      ]),
    }],
    ["5.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.1.0"],
        ["strip-ansi", "5.2.0"],
      ]),
    }],
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "2.1.1"],
        ["strip-ansi", "3.0.1"],
      ]),
    }],
  ])],
  ["ansi-regex", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "3.0.0"],
      ]),
    }],
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.1.0"],
      ]),
    }],
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "2.1.1"],
      ]),
    }],
  ])],
  ["through", new Map([
    ["2.3.8", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5/node_modules/through/"),
      packageDependencies: new Map([
        ["through", "2.3.8"],
      ]),
    }],
  ])],
  ["simple-git", new Map([
    ["1.115.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-simple-git-1.115.0-159a49cf95c5126d5903e36df67504a8c634e817/node_modules/simple-git/"),
      packageDependencies: new Map([
        ["debug", "4.1.1"],
        ["simple-git", "1.115.0"],
      ]),
    }],
  ])],
  ["debug", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.1.2"],
        ["debug", "4.1.1"],
      ]),
    }],
    ["2.6.9", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
        ["debug", "2.6.9"],
      ]),
    }],
    ["3.2.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.1.2"],
        ["debug", "3.2.6"],
      ]),
    }],
  ])],
  ["ms", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.1.2"],
      ]),
    }],
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
      ]),
    }],
  ])],
  ["eslint", new Map([
    ["5.16.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-5.16.0-a1e3ac1aae4a3fbd8296fcf8f7ab7314cbb6abea/node_modules/eslint/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.0.0"],
        ["ajv", "6.10.0"],
        ["chalk", "2.4.2"],
        ["cross-spawn", "6.0.5"],
        ["debug", "4.1.1"],
        ["doctrine", "3.0.0"],
        ["eslint-scope", "4.0.3"],
        ["eslint-utils", "1.3.1"],
        ["eslint-visitor-keys", "1.0.0"],
        ["espree", "5.0.1"],
        ["esquery", "1.0.1"],
        ["esutils", "2.0.2"],
        ["file-entry-cache", "5.0.1"],
        ["functional-red-black-tree", "1.0.1"],
        ["glob", "7.1.4"],
        ["globals", "11.12.0"],
        ["ignore", "4.0.6"],
        ["import-fresh", "3.0.0"],
        ["imurmurhash", "0.1.4"],
        ["inquirer", "6.3.1"],
        ["js-yaml", "3.13.1"],
        ["json-stable-stringify-without-jsonify", "1.0.1"],
        ["levn", "0.3.0"],
        ["lodash", "4.17.11"],
        ["minimatch", "3.0.4"],
        ["mkdirp", "0.5.1"],
        ["natural-compare", "1.4.0"],
        ["optionator", "0.8.2"],
        ["path-is-inside", "1.0.2"],
        ["progress", "2.0.3"],
        ["regexpp", "2.0.1"],
        ["semver", "5.7.0"],
        ["strip-ansi", "4.0.0"],
        ["strip-json-comments", "2.0.1"],
        ["table", "5.4.0"],
        ["text-table", "0.2.0"],
        ["eslint", "5.16.0"],
      ]),
    }],
  ])],
  ["@babel/code-frame", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/"),
      packageDependencies: new Map([
        ["@babel/highlight", "7.0.0"],
        ["@babel/code-frame", "7.0.0"],
      ]),
    }],
  ])],
  ["@babel/highlight", new Map([
    ["7.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["esutils", "2.0.2"],
        ["js-tokens", "4.0.0"],
        ["@babel/highlight", "7.0.0"],
      ]),
    }],
  ])],
  ["esutils", new Map([
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
      ]),
    }],
  ])],
  ["js-tokens", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/"),
      packageDependencies: new Map([
        ["js-tokens", "4.0.0"],
      ]),
    }],
  ])],
  ["ajv", new Map([
    ["6.10.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ajv-6.10.0-90d0d54439da587cd7e843bfb7045f50bd22bdf1/node_modules/ajv/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
        ["fast-json-stable-stringify", "2.0.0"],
        ["json-schema-traverse", "0.4.1"],
        ["uri-js", "4.2.2"],
        ["ajv", "6.10.0"],
      ]),
    }],
  ])],
  ["fast-deep-equal", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
      ]),
    }],
  ])],
  ["fast-json-stable-stringify", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/"),
      packageDependencies: new Map([
        ["fast-json-stable-stringify", "2.0.0"],
      ]),
    }],
  ])],
  ["json-schema-traverse", new Map([
    ["0.4.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/"),
      packageDependencies: new Map([
        ["json-schema-traverse", "0.4.1"],
      ]),
    }],
  ])],
  ["uri-js", new Map([
    ["4.2.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
        ["uri-js", "4.2.2"],
      ]),
    }],
  ])],
  ["punycode", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
      ]),
    }],
  ])],
  ["nice-try", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
      ]),
    }],
  ])],
  ["semver", new Map([
    ["5.7.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-semver-5.7.0-790a7cf6fea5459bac96110b29b60412dc8ff96b/node_modules/semver/"),
      packageDependencies: new Map([
        ["semver", "5.7.0"],
      ]),
    }],
  ])],
  ["doctrine", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961/node_modules/doctrine/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
        ["doctrine", "3.0.0"],
      ]),
    }],
    ["1.5.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-doctrine-1.5.0-379dce730f6166f76cefa4e6707a159b02c5a6fa/node_modules/doctrine/"),
      packageDependencies: new Map([
        ["esutils", "2.0.2"],
        ["isarray", "1.0.0"],
        ["doctrine", "1.5.0"],
      ]),
    }],
  ])],
  ["eslint-scope", new Map([
    ["4.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-scope-4.0.3-ca03833310f6889a3264781aa82e63eb9cfe7848/node_modules/eslint-scope/"),
      packageDependencies: new Map([
        ["esrecurse", "4.2.1"],
        ["estraverse", "4.2.0"],
        ["eslint-scope", "4.0.3"],
      ]),
    }],
  ])],
  ["esrecurse", new Map([
    ["4.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
        ["esrecurse", "4.2.1"],
      ]),
    }],
  ])],
  ["estraverse", new Map([
    ["4.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
      ]),
    }],
  ])],
  ["eslint-utils", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-utils-1.3.1-9a851ba89ee7c460346f97cf8939c7298827e512/node_modules/eslint-utils/"),
      packageDependencies: new Map([
        ["eslint-utils", "1.3.1"],
      ]),
    }],
  ])],
  ["eslint-visitor-keys", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-visitor-keys-1.0.0-3f3180fb2e291017716acb4c9d6d5b5c34a6a81d/node_modules/eslint-visitor-keys/"),
      packageDependencies: new Map([
        ["eslint-visitor-keys", "1.0.0"],
      ]),
    }],
  ])],
  ["espree", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-espree-5.0.1-5d6526fa4fc7f0788a5cf75b15f30323e2f81f7a/node_modules/espree/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
        ["acorn-jsx", "5.0.1"],
        ["eslint-visitor-keys", "1.0.0"],
        ["espree", "5.0.1"],
      ]),
    }],
  ])],
  ["acorn", new Map([
    ["6.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-acorn-6.1.1-7d25ae05bb8ad1f9b699108e1094ecd7884adc1f/node_modules/acorn/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
      ]),
    }],
  ])],
  ["acorn-jsx", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-acorn-jsx-5.0.1-32a064fd925429216a09b141102bfdd185fae40e/node_modules/acorn-jsx/"),
      packageDependencies: new Map([
        ["acorn", "6.1.1"],
        ["acorn-jsx", "5.0.1"],
      ]),
    }],
  ])],
  ["esquery", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708/node_modules/esquery/"),
      packageDependencies: new Map([
        ["estraverse", "4.2.0"],
        ["esquery", "1.0.1"],
      ]),
    }],
  ])],
  ["file-entry-cache", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c/node_modules/file-entry-cache/"),
      packageDependencies: new Map([
        ["flat-cache", "2.0.1"],
        ["file-entry-cache", "5.0.1"],
      ]),
    }],
  ])],
  ["flat-cache", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0/node_modules/flat-cache/"),
      packageDependencies: new Map([
        ["flatted", "2.0.0"],
        ["rimraf", "2.6.3"],
        ["write", "1.0.3"],
        ["flat-cache", "2.0.1"],
      ]),
    }],
  ])],
  ["flatted", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-flatted-2.0.0-55122b6536ea496b4b44893ee2608141d10d9916/node_modules/flatted/"),
      packageDependencies: new Map([
        ["flatted", "2.0.0"],
      ]),
    }],
  ])],
  ["rimraf", new Map([
    ["2.6.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab/node_modules/rimraf/"),
      packageDependencies: new Map([
        ["glob", "7.1.4"],
        ["rimraf", "2.6.3"],
      ]),
    }],
  ])],
  ["glob", new Map([
    ["7.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-glob-7.1.4-aa608a2f6c577ad357e1ae5a5c26d9a8d1969255/node_modules/glob/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
        ["inflight", "1.0.6"],
        ["inherits", "2.0.3"],
        ["minimatch", "3.0.4"],
        ["once", "1.4.0"],
        ["path-is-absolute", "1.0.1"],
        ["glob", "7.1.4"],
      ]),
    }],
  ])],
  ["fs.realpath", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
      ]),
    }],
  ])],
  ["inflight", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/"),
      packageDependencies: new Map([
        ["once", "1.4.0"],
        ["wrappy", "1.0.2"],
        ["inflight", "1.0.6"],
      ]),
    }],
  ])],
  ["once", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
        ["once", "1.4.0"],
      ]),
    }],
  ])],
  ["wrappy", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
      ]),
    }],
  ])],
  ["inherits", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/"),
      packageDependencies: new Map([
        ["inherits", "2.0.3"],
      ]),
    }],
  ])],
  ["minimatch", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/"),
      packageDependencies: new Map([
        ["brace-expansion", "1.1.11"],
        ["minimatch", "3.0.4"],
      ]),
    }],
  ])],
  ["brace-expansion", new Map([
    ["1.1.11", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
        ["concat-map", "0.0.1"],
        ["brace-expansion", "1.1.11"],
      ]),
    }],
  ])],
  ["balanced-match", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
      ]),
    }],
  ])],
  ["concat-map", new Map([
    ["0.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/"),
      packageDependencies: new Map([
        ["concat-map", "0.0.1"],
      ]),
    }],
  ])],
  ["write", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3/node_modules/write/"),
      packageDependencies: new Map([
        ["mkdirp", "0.5.1"],
        ["write", "1.0.3"],
      ]),
    }],
  ])],
  ["mkdirp", new Map([
    ["0.5.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
        ["mkdirp", "0.5.1"],
      ]),
    }],
  ])],
  ["minimist", new Map([
    ["0.0.8", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
      ]),
    }],
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "1.2.0"],
      ]),
    }],
  ])],
  ["functional-red-black-tree", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327/node_modules/functional-red-black-tree/"),
      packageDependencies: new Map([
        ["functional-red-black-tree", "1.0.1"],
      ]),
    }],
  ])],
  ["globals", new Map([
    ["11.12.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-globals-11.12.0-ab8795338868a0babd8525758018c2a7eb95c42e/node_modules/globals/"),
      packageDependencies: new Map([
        ["globals", "11.12.0"],
      ]),
    }],
  ])],
  ["ignore", new Map([
    ["4.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc/node_modules/ignore/"),
      packageDependencies: new Map([
        ["ignore", "4.0.6"],
      ]),
    }],
  ])],
  ["import-fresh", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-import-fresh-3.0.0-a3d897f420cab0e671236897f75bc14b4885c390/node_modules/import-fresh/"),
      packageDependencies: new Map([
        ["parent-module", "1.0.1"],
        ["resolve-from", "4.0.0"],
        ["import-fresh", "3.0.0"],
      ]),
    }],
  ])],
  ["parent-module", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-parent-module-1.0.1-691d2709e78c79fae3a156622452d00762caaaa2/node_modules/parent-module/"),
      packageDependencies: new Map([
        ["callsites", "3.1.0"],
        ["parent-module", "1.0.1"],
      ]),
    }],
  ])],
  ["callsites", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-callsites-3.1.0-b3630abd8943432f54b3f0519238e33cd7df2f73/node_modules/callsites/"),
      packageDependencies: new Map([
        ["callsites", "3.1.0"],
      ]),
    }],
  ])],
  ["resolve-from", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6/node_modules/resolve-from/"),
      packageDependencies: new Map([
        ["resolve-from", "4.0.0"],
      ]),
    }],
  ])],
  ["imurmurhash", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/"),
      packageDependencies: new Map([
        ["imurmurhash", "0.1.4"],
      ]),
    }],
  ])],
  ["js-yaml", new Map([
    ["3.13.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-js-yaml-3.13.1-aff151b30bfdfa8e49e05da22e7415e9dfa37847/node_modules/js-yaml/"),
      packageDependencies: new Map([
        ["argparse", "1.0.10"],
        ["esprima", "4.0.1"],
        ["js-yaml", "3.13.1"],
      ]),
    }],
  ])],
  ["argparse", new Map([
    ["1.0.10", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
        ["argparse", "1.0.10"],
      ]),
    }],
  ])],
  ["sprintf-js", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
      ]),
    }],
  ])],
  ["esprima", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/"),
      packageDependencies: new Map([
        ["esprima", "4.0.1"],
      ]),
    }],
  ])],
  ["json-stable-stringify-without-jsonify", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651/node_modules/json-stable-stringify-without-jsonify/"),
      packageDependencies: new Map([
        ["json-stable-stringify-without-jsonify", "1.0.1"],
      ]),
    }],
  ])],
  ["levn", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["levn", "0.3.0"],
      ]),
    }],
  ])],
  ["prelude-ls", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
      ]),
    }],
  ])],
  ["type-check", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
      ]),
    }],
  ])],
  ["natural-compare", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/"),
      packageDependencies: new Map([
        ["natural-compare", "1.4.0"],
      ]),
    }],
  ])],
  ["optionator", new Map([
    ["0.8.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
        ["fast-levenshtein", "2.0.6"],
        ["levn", "0.3.0"],
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["wordwrap", "1.0.0"],
        ["optionator", "0.8.2"],
      ]),
    }],
  ])],
  ["deep-is", new Map([
    ["0.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
      ]),
    }],
  ])],
  ["fast-levenshtein", new Map([
    ["2.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/"),
      packageDependencies: new Map([
        ["fast-levenshtein", "2.0.6"],
      ]),
    }],
  ])],
  ["wordwrap", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/"),
      packageDependencies: new Map([
        ["wordwrap", "1.0.0"],
      ]),
    }],
  ])],
  ["path-is-inside", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/"),
      packageDependencies: new Map([
        ["path-is-inside", "1.0.2"],
      ]),
    }],
  ])],
  ["progress", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8/node_modules/progress/"),
      packageDependencies: new Map([
        ["progress", "2.0.3"],
      ]),
    }],
  ])],
  ["regexpp", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f/node_modules/regexpp/"),
      packageDependencies: new Map([
        ["regexpp", "2.0.1"],
      ]),
    }],
  ])],
  ["strip-json-comments", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-json-comments-2.0.1-3c531942e908c2697c0ec344858c286c7ca0a60a/node_modules/strip-json-comments/"),
      packageDependencies: new Map([
        ["strip-json-comments", "2.0.1"],
      ]),
    }],
  ])],
  ["table", new Map([
    ["5.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-table-5.4.0-d772a3216e68829920a41a32c18eda286c95d780/node_modules/table/"),
      packageDependencies: new Map([
        ["ajv", "6.10.0"],
        ["lodash", "4.17.11"],
        ["slice-ansi", "2.1.0"],
        ["string-width", "3.1.0"],
        ["table", "5.4.0"],
      ]),
    }],
  ])],
  ["slice-ansi", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636/node_modules/slice-ansi/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["astral-regex", "1.0.0"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["slice-ansi", "2.1.0"],
      ]),
    }],
  ])],
  ["astral-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/"),
      packageDependencies: new Map([
        ["astral-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["emoji-regex", new Map([
    ["7.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
      ]),
    }],
  ])],
  ["text-table", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4/node_modules/text-table/"),
      packageDependencies: new Map([
        ["text-table", "0.2.0"],
      ]),
    }],
  ])],
  ["eslint-config-airbnb-base", new Map([
    ["13.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-config-airbnb-base-13.1.0-b5a1b480b80dfad16433d6c4ad84e6605052c05c/node_modules/eslint-config-airbnb-base/"),
      packageDependencies: new Map([
        ["eslint", "5.16.0"],
        ["eslint-plugin-import", "2.17.3"],
        ["eslint-restricted-globals", "0.1.1"],
        ["object.assign", "4.1.0"],
        ["object.entries", "1.1.0"],
        ["eslint-config-airbnb-base", "13.1.0"],
      ]),
    }],
  ])],
  ["eslint-restricted-globals", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-restricted-globals-0.1.1-35f0d5cbc64c2e3ed62e93b4b1a7af05ba7ed4d7/node_modules/eslint-restricted-globals/"),
      packageDependencies: new Map([
        ["eslint-restricted-globals", "0.1.1"],
      ]),
    }],
  ])],
  ["object.assign", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-assign-4.1.0-968bf1100d7956bb3ca086f006f846b3bc4008da/node_modules/object.assign/"),
      packageDependencies: new Map([
        ["define-properties", "1.1.3"],
        ["function-bind", "1.1.1"],
        ["has-symbols", "1.0.0"],
        ["object-keys", "1.1.1"],
        ["object.assign", "4.1.0"],
      ]),
    }],
  ])],
  ["define-properties", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/"),
      packageDependencies: new Map([
        ["object-keys", "1.1.1"],
        ["define-properties", "1.1.3"],
      ]),
    }],
  ])],
  ["object-keys", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-keys-1.1.1-1c47f272df277f3b1daf061677d9c82e2322c60e/node_modules/object-keys/"),
      packageDependencies: new Map([
        ["object-keys", "1.1.1"],
      ]),
    }],
  ])],
  ["function-bind", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/"),
      packageDependencies: new Map([
        ["function-bind", "1.1.1"],
      ]),
    }],
  ])],
  ["has-symbols", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/"),
      packageDependencies: new Map([
        ["has-symbols", "1.0.0"],
      ]),
    }],
  ])],
  ["object.entries", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-entries-1.1.0-2024fc6d6ba246aee38bdb0ffd5cfbcf371b7519/node_modules/object.entries/"),
      packageDependencies: new Map([
        ["define-properties", "1.1.3"],
        ["es-abstract", "1.13.0"],
        ["function-bind", "1.1.1"],
        ["has", "1.0.3"],
        ["object.entries", "1.1.0"],
      ]),
    }],
  ])],
  ["es-abstract", new Map([
    ["1.13.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-es-abstract-1.13.0-ac86145fdd5099d8dd49558ccba2eaf9b88e24e9/node_modules/es-abstract/"),
      packageDependencies: new Map([
        ["es-to-primitive", "1.2.0"],
        ["function-bind", "1.1.1"],
        ["has", "1.0.3"],
        ["is-callable", "1.1.4"],
        ["is-regex", "1.0.4"],
        ["object-keys", "1.1.1"],
        ["es-abstract", "1.13.0"],
      ]),
    }],
  ])],
  ["es-to-primitive", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/"),
      packageDependencies: new Map([
        ["is-callable", "1.1.4"],
        ["is-date-object", "1.0.1"],
        ["is-symbol", "1.0.2"],
        ["es-to-primitive", "1.2.0"],
      ]),
    }],
  ])],
  ["is-callable", new Map([
    ["1.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/"),
      packageDependencies: new Map([
        ["is-callable", "1.1.4"],
      ]),
    }],
  ])],
  ["is-date-object", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/"),
      packageDependencies: new Map([
        ["is-date-object", "1.0.1"],
      ]),
    }],
  ])],
  ["is-symbol", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/"),
      packageDependencies: new Map([
        ["has-symbols", "1.0.0"],
        ["is-symbol", "1.0.2"],
      ]),
    }],
  ])],
  ["has", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/"),
      packageDependencies: new Map([
        ["function-bind", "1.1.1"],
        ["has", "1.0.3"],
      ]),
    }],
  ])],
  ["is-regex", new Map([
    ["1.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/"),
      packageDependencies: new Map([
        ["has", "1.0.3"],
        ["is-regex", "1.0.4"],
      ]),
    }],
  ])],
  ["eslint-plugin-import", new Map([
    ["2.17.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-plugin-import-2.17.3-00548b4434c18faebaba04b24ae6198f280de189/node_modules/eslint-plugin-import/"),
      packageDependencies: new Map([
        ["eslint", "5.16.0"],
        ["array-includes", "3.0.3"],
        ["contains-path", "0.1.0"],
        ["debug", "2.6.9"],
        ["doctrine", "1.5.0"],
        ["eslint-import-resolver-node", "0.3.2"],
        ["eslint-module-utils", "2.4.0"],
        ["has", "1.0.3"],
        ["lodash", "4.17.11"],
        ["minimatch", "3.0.4"],
        ["read-pkg-up", "2.0.0"],
        ["resolve", "1.11.0"],
        ["eslint-plugin-import", "2.17.3"],
      ]),
    }],
  ])],
  ["array-includes", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-array-includes-3.0.3-184b48f62d92d7452bb31b323165c7f8bd02266d/node_modules/array-includes/"),
      packageDependencies: new Map([
        ["define-properties", "1.1.3"],
        ["es-abstract", "1.13.0"],
        ["array-includes", "3.0.3"],
      ]),
    }],
  ])],
  ["contains-path", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-contains-path-0.1.0-fe8cf184ff6670b6baef01a9d4861a5cbec4120a/node_modules/contains-path/"),
      packageDependencies: new Map([
        ["contains-path", "0.1.0"],
      ]),
    }],
  ])],
  ["isarray", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/"),
      packageDependencies: new Map([
        ["isarray", "1.0.0"],
      ]),
    }],
  ])],
  ["eslint-import-resolver-node", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-import-resolver-node-0.3.2-58f15fb839b8d0576ca980413476aab2472db66a/node_modules/eslint-import-resolver-node/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["resolve", "1.11.0"],
        ["eslint-import-resolver-node", "0.3.2"],
      ]),
    }],
  ])],
  ["resolve", new Map([
    ["1.11.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-resolve-1.11.0-4014870ba296176b86343d50b60f3b50609ce232/node_modules/resolve/"),
      packageDependencies: new Map([
        ["path-parse", "1.0.6"],
        ["resolve", "1.11.0"],
      ]),
    }],
  ])],
  ["path-parse", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/"),
      packageDependencies: new Map([
        ["path-parse", "1.0.6"],
      ]),
    }],
  ])],
  ["eslint-module-utils", new Map([
    ["2.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-eslint-module-utils-2.4.0-8b93499e9b00eab80ccb6614e69f03678e84e09a/node_modules/eslint-module-utils/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["pkg-dir", "2.0.0"],
        ["eslint-module-utils", "2.4.0"],
      ]),
    }],
  ])],
  ["pkg-dir", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pkg-dir-2.0.0-f6d5d1109e19d63edf428e0bd57e12777615334b/node_modules/pkg-dir/"),
      packageDependencies: new Map([
        ["find-up", "2.1.0"],
        ["pkg-dir", "2.0.0"],
      ]),
    }],
  ])],
  ["find-up", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-find-up-2.1.0-45d1b7e506c717ddd482775a2b77920a3c0c57a7/node_modules/find-up/"),
      packageDependencies: new Map([
        ["locate-path", "2.0.0"],
        ["find-up", "2.1.0"],
      ]),
    }],
  ])],
  ["locate-path", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-locate-path-2.0.0-2b568b265eec944c6d9c0de9c3dbbbca0354cd8e/node_modules/locate-path/"),
      packageDependencies: new Map([
        ["p-locate", "2.0.0"],
        ["path-exists", "3.0.0"],
        ["locate-path", "2.0.0"],
      ]),
    }],
  ])],
  ["p-locate", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-locate-2.0.0-20a0103b222a70c8fd39cc2e580680f3dde5ec43/node_modules/p-locate/"),
      packageDependencies: new Map([
        ["p-limit", "1.3.0"],
        ["p-locate", "2.0.0"],
      ]),
    }],
  ])],
  ["p-limit", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-limit-1.3.0-b86bd5f0c25690911c7590fcbfc2010d54b3ccb8/node_modules/p-limit/"),
      packageDependencies: new Map([
        ["p-try", "1.0.0"],
        ["p-limit", "1.3.0"],
      ]),
    }],
  ])],
  ["p-try", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-try-1.0.0-cbc79cdbaf8fd4228e13f621f2b1a237c1b207b3/node_modules/p-try/"),
      packageDependencies: new Map([
        ["p-try", "1.0.0"],
      ]),
    }],
  ])],
  ["path-exists", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/"),
      packageDependencies: new Map([
        ["path-exists", "3.0.0"],
      ]),
    }],
  ])],
  ["read-pkg-up", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-read-pkg-up-2.0.0-6b72a8048984e0c41e79510fd5e9fa99b3b549be/node_modules/read-pkg-up/"),
      packageDependencies: new Map([
        ["find-up", "2.1.0"],
        ["read-pkg", "2.0.0"],
        ["read-pkg-up", "2.0.0"],
      ]),
    }],
  ])],
  ["read-pkg", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-read-pkg-2.0.0-8ef1c0623c6a6db0dc6713c4bfac46332b2368f8/node_modules/read-pkg/"),
      packageDependencies: new Map([
        ["load-json-file", "2.0.0"],
        ["normalize-package-data", "2.5.0"],
        ["path-type", "2.0.0"],
        ["read-pkg", "2.0.0"],
      ]),
    }],
  ])],
  ["load-json-file", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-load-json-file-2.0.0-7947e42149af80d696cbf797bcaabcfe1fe29ca8/node_modules/load-json-file/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
        ["parse-json", "2.2.0"],
        ["pify", "2.3.0"],
        ["strip-bom", "3.0.0"],
        ["load-json-file", "2.0.0"],
      ]),
    }],
  ])],
  ["graceful-fs", new Map([
    ["4.1.15", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
      ]),
    }],
  ])],
  ["parse-json", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-parse-json-2.2.0-f480f40434ef80741f8469099f8dea18f55a4dc9/node_modules/parse-json/"),
      packageDependencies: new Map([
        ["error-ex", "1.3.2"],
        ["parse-json", "2.2.0"],
      ]),
    }],
  ])],
  ["error-ex", new Map([
    ["1.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/"),
      packageDependencies: new Map([
        ["is-arrayish", "0.2.1"],
        ["error-ex", "1.3.2"],
      ]),
    }],
  ])],
  ["is-arrayish", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/"),
      packageDependencies: new Map([
        ["is-arrayish", "0.2.1"],
      ]),
    }],
  ])],
  ["pify", new Map([
    ["2.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/"),
      packageDependencies: new Map([
        ["pify", "2.3.0"],
      ]),
    }],
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pify-3.0.0-e5a4acd2c101fdf3d9a4d07f0dbc4db49dd28176/node_modules/pify/"),
      packageDependencies: new Map([
        ["pify", "3.0.0"],
      ]),
    }],
  ])],
  ["strip-bom", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/"),
      packageDependencies: new Map([
        ["strip-bom", "3.0.0"],
      ]),
    }],
  ])],
  ["normalize-package-data", new Map([
    ["2.5.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-normalize-package-data-2.5.0-e66db1838b200c1dfc233225d12cb36520e234a8/node_modules/normalize-package-data/"),
      packageDependencies: new Map([
        ["hosted-git-info", "2.7.1"],
        ["resolve", "1.11.0"],
        ["semver", "5.7.0"],
        ["validate-npm-package-license", "3.0.4"],
        ["normalize-package-data", "2.5.0"],
      ]),
    }],
  ])],
  ["hosted-git-info", new Map([
    ["2.7.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/"),
      packageDependencies: new Map([
        ["hosted-git-info", "2.7.1"],
      ]),
    }],
  ])],
  ["validate-npm-package-license", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/"),
      packageDependencies: new Map([
        ["spdx-correct", "3.1.0"],
        ["spdx-expression-parse", "3.0.0"],
        ["validate-npm-package-license", "3.0.4"],
      ]),
    }],
  ])],
  ["spdx-correct", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-spdx-correct-3.1.0-fb83e504445268f154b074e218c87c003cd31df4/node_modules/spdx-correct/"),
      packageDependencies: new Map([
        ["spdx-expression-parse", "3.0.0"],
        ["spdx-license-ids", "3.0.4"],
        ["spdx-correct", "3.1.0"],
      ]),
    }],
  ])],
  ["spdx-expression-parse", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/"),
      packageDependencies: new Map([
        ["spdx-exceptions", "2.2.0"],
        ["spdx-license-ids", "3.0.4"],
        ["spdx-expression-parse", "3.0.0"],
      ]),
    }],
  ])],
  ["spdx-exceptions", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/"),
      packageDependencies: new Map([
        ["spdx-exceptions", "2.2.0"],
      ]),
    }],
  ])],
  ["spdx-license-ids", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-spdx-license-ids-3.0.4-75ecd1a88de8c184ef015eafb51b5b48bfd11bb1/node_modules/spdx-license-ids/"),
      packageDependencies: new Map([
        ["spdx-license-ids", "3.0.4"],
      ]),
    }],
  ])],
  ["path-type", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-type-2.0.0-f012ccb8415b7096fc2daa1054c3d72389594c73/node_modules/path-type/"),
      packageDependencies: new Map([
        ["pify", "2.3.0"],
        ["path-type", "2.0.0"],
      ]),
    }],
  ])],
  ["nodemon", new Map([
    ["1.19.1", {
      packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-nodemon-1.19.1-576f0aad0f863aabf8c48517f6192ff987cd5071/node_modules/nodemon/"),
      packageDependencies: new Map([
        ["chokidar", "2.1.6"],
        ["debug", "3.2.6"],
        ["ignore-by-default", "1.0.1"],
        ["minimatch", "3.0.4"],
        ["pstree.remy", "1.1.7"],
        ["semver", "5.7.0"],
        ["supports-color", "5.5.0"],
        ["touch", "3.1.0"],
        ["undefsafe", "2.0.2"],
        ["update-notifier", "2.5.0"],
        ["nodemon", "1.19.1"],
      ]),
    }],
  ])],
  ["chokidar", new Map([
    ["2.1.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-chokidar-2.1.6-b6cad653a929e244ce8a834244164d241fa954c5/node_modules/chokidar/"),
      packageDependencies: new Map([
        ["anymatch", "2.0.0"],
        ["async-each", "1.0.3"],
        ["braces", "2.3.2"],
        ["glob-parent", "3.1.0"],
        ["inherits", "2.0.3"],
        ["is-binary-path", "1.0.1"],
        ["is-glob", "4.0.1"],
        ["normalize-path", "3.0.0"],
        ["path-is-absolute", "1.0.1"],
        ["readdirp", "2.2.1"],
        ["upath", "1.1.2"],
        ["fsevents", "1.2.9"],
        ["chokidar", "2.1.6"],
      ]),
    }],
  ])],
  ["anymatch", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/"),
      packageDependencies: new Map([
        ["micromatch", "3.1.10"],
        ["normalize-path", "2.1.1"],
        ["anymatch", "2.0.0"],
      ]),
    }],
  ])],
  ["micromatch", new Map([
    ["3.1.10", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
        ["array-unique", "0.3.2"],
        ["braces", "2.3.2"],
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["extglob", "2.0.4"],
        ["fragment-cache", "0.2.1"],
        ["kind-of", "6.0.2"],
        ["nanomatch", "1.2.13"],
        ["object.pick", "1.3.0"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["micromatch", "3.1.10"],
      ]),
    }],
  ])],
  ["arr-diff", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
      ]),
    }],
  ])],
  ["array-unique", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/"),
      packageDependencies: new Map([
        ["array-unique", "0.3.2"],
      ]),
    }],
  ])],
  ["braces", new Map([
    ["2.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/"),
      packageDependencies: new Map([
        ["arr-flatten", "1.1.0"],
        ["array-unique", "0.3.2"],
        ["extend-shallow", "2.0.1"],
        ["fill-range", "4.0.0"],
        ["isobject", "3.0.1"],
        ["repeat-element", "1.1.3"],
        ["snapdragon", "0.8.2"],
        ["snapdragon-node", "2.1.1"],
        ["split-string", "3.1.0"],
        ["to-regex", "3.0.2"],
        ["braces", "2.3.2"],
      ]),
    }],
  ])],
  ["arr-flatten", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/"),
      packageDependencies: new Map([
        ["arr-flatten", "1.1.0"],
      ]),
    }],
  ])],
  ["extend-shallow", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/"),
      packageDependencies: new Map([
        ["is-extendable", "0.1.1"],
        ["extend-shallow", "2.0.1"],
      ]),
    }],
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/"),
      packageDependencies: new Map([
        ["assign-symbols", "1.0.0"],
        ["is-extendable", "1.0.1"],
        ["extend-shallow", "3.0.2"],
      ]),
    }],
  ])],
  ["is-extendable", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/"),
      packageDependencies: new Map([
        ["is-extendable", "0.1.1"],
      ]),
    }],
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/"),
      packageDependencies: new Map([
        ["is-plain-object", "2.0.4"],
        ["is-extendable", "1.0.1"],
      ]),
    }],
  ])],
  ["fill-range", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-number", "3.0.0"],
        ["repeat-string", "1.6.1"],
        ["to-regex-range", "2.1.1"],
        ["fill-range", "4.0.0"],
      ]),
    }],
  ])],
  ["is-number", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-number", "3.0.0"],
      ]),
    }],
  ])],
  ["kind-of", new Map([
    ["3.2.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
        ["kind-of", "3.2.2"],
      ]),
    }],
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
        ["kind-of", "4.0.0"],
      ]),
    }],
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["kind-of", "5.1.0"],
      ]),
    }],
    ["6.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
      ]),
    }],
  ])],
  ["is-buffer", new Map([
    ["1.1.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/"),
      packageDependencies: new Map([
        ["is-buffer", "1.1.6"],
      ]),
    }],
  ])],
  ["repeat-string", new Map([
    ["1.6.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/"),
      packageDependencies: new Map([
        ["repeat-string", "1.6.1"],
      ]),
    }],
  ])],
  ["to-regex-range", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/"),
      packageDependencies: new Map([
        ["is-number", "3.0.0"],
        ["repeat-string", "1.6.1"],
        ["to-regex-range", "2.1.1"],
      ]),
    }],
  ])],
  ["isobject", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
      ]),
    }],
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/"),
      packageDependencies: new Map([
        ["isarray", "1.0.0"],
        ["isobject", "2.1.0"],
      ]),
    }],
  ])],
  ["repeat-element", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/"),
      packageDependencies: new Map([
        ["repeat-element", "1.1.3"],
      ]),
    }],
  ])],
  ["snapdragon", new Map([
    ["0.8.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/"),
      packageDependencies: new Map([
        ["base", "0.11.2"],
        ["debug", "2.6.9"],
        ["define-property", "0.2.5"],
        ["extend-shallow", "2.0.1"],
        ["map-cache", "0.2.2"],
        ["source-map", "0.5.7"],
        ["source-map-resolve", "0.5.2"],
        ["use", "3.1.1"],
        ["snapdragon", "0.8.2"],
      ]),
    }],
  ])],
  ["base", new Map([
    ["0.11.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/"),
      packageDependencies: new Map([
        ["cache-base", "1.0.1"],
        ["class-utils", "0.3.6"],
        ["component-emitter", "1.3.0"],
        ["define-property", "1.0.0"],
        ["isobject", "3.0.1"],
        ["mixin-deep", "1.3.1"],
        ["pascalcase", "0.1.1"],
        ["base", "0.11.2"],
      ]),
    }],
  ])],
  ["cache-base", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/"),
      packageDependencies: new Map([
        ["collection-visit", "1.0.0"],
        ["component-emitter", "1.3.0"],
        ["get-value", "2.0.6"],
        ["has-value", "1.0.0"],
        ["isobject", "3.0.1"],
        ["set-value", "2.0.0"],
        ["to-object-path", "0.3.0"],
        ["union-value", "1.0.0"],
        ["unset-value", "1.0.0"],
        ["cache-base", "1.0.1"],
      ]),
    }],
  ])],
  ["collection-visit", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/"),
      packageDependencies: new Map([
        ["map-visit", "1.0.0"],
        ["object-visit", "1.0.1"],
        ["collection-visit", "1.0.0"],
      ]),
    }],
  ])],
  ["map-visit", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/"),
      packageDependencies: new Map([
        ["object-visit", "1.0.1"],
        ["map-visit", "1.0.0"],
      ]),
    }],
  ])],
  ["object-visit", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["object-visit", "1.0.1"],
      ]),
    }],
  ])],
  ["component-emitter", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-component-emitter-1.3.0-16e4070fba8ae29b679f2215853ee181ab2eabc0/node_modules/component-emitter/"),
      packageDependencies: new Map([
        ["component-emitter", "1.3.0"],
      ]),
    }],
  ])],
  ["get-value", new Map([
    ["2.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
      ]),
    }],
  ])],
  ["has-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
        ["has-values", "1.0.0"],
        ["isobject", "3.0.1"],
        ["has-value", "1.0.0"],
      ]),
    }],
    ["0.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/"),
      packageDependencies: new Map([
        ["get-value", "2.0.6"],
        ["has-values", "0.1.4"],
        ["isobject", "2.1.0"],
        ["has-value", "0.3.1"],
      ]),
    }],
  ])],
  ["has-values", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/"),
      packageDependencies: new Map([
        ["is-number", "3.0.0"],
        ["kind-of", "4.0.0"],
        ["has-values", "1.0.0"],
      ]),
    }],
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/"),
      packageDependencies: new Map([
        ["has-values", "0.1.4"],
      ]),
    }],
  ])],
  ["set-value", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-extendable", "0.1.1"],
        ["is-plain-object", "2.0.4"],
        ["split-string", "3.1.0"],
        ["set-value", "2.0.0"],
      ]),
    }],
    ["0.4.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/"),
      packageDependencies: new Map([
        ["extend-shallow", "2.0.1"],
        ["is-extendable", "0.1.1"],
        ["is-plain-object", "2.0.4"],
        ["to-object-path", "0.3.0"],
        ["set-value", "0.4.3"],
      ]),
    }],
  ])],
  ["is-plain-object", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["is-plain-object", "2.0.4"],
      ]),
    }],
  ])],
  ["split-string", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/"),
      packageDependencies: new Map([
        ["extend-shallow", "3.0.2"],
        ["split-string", "3.1.0"],
      ]),
    }],
  ])],
  ["assign-symbols", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/"),
      packageDependencies: new Map([
        ["assign-symbols", "1.0.0"],
      ]),
    }],
  ])],
  ["to-object-path", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["to-object-path", "0.3.0"],
      ]),
    }],
  ])],
  ["union-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
        ["get-value", "2.0.6"],
        ["is-extendable", "0.1.1"],
        ["set-value", "0.4.3"],
        ["union-value", "1.0.0"],
      ]),
    }],
  ])],
  ["arr-union", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
      ]),
    }],
  ])],
  ["unset-value", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/"),
      packageDependencies: new Map([
        ["has-value", "0.3.1"],
        ["isobject", "3.0.1"],
        ["unset-value", "1.0.0"],
      ]),
    }],
  ])],
  ["class-utils", new Map([
    ["0.3.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/"),
      packageDependencies: new Map([
        ["arr-union", "3.1.0"],
        ["define-property", "0.2.5"],
        ["isobject", "3.0.1"],
        ["static-extend", "0.1.2"],
        ["class-utils", "0.3.6"],
      ]),
    }],
  ])],
  ["define-property", new Map([
    ["0.2.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "0.1.6"],
        ["define-property", "0.2.5"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "1.0.2"],
        ["define-property", "1.0.0"],
      ]),
    }],
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/"),
      packageDependencies: new Map([
        ["is-descriptor", "1.0.2"],
        ["isobject", "3.0.1"],
        ["define-property", "2.0.2"],
      ]),
    }],
  ])],
  ["is-descriptor", new Map([
    ["0.1.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/"),
      packageDependencies: new Map([
        ["is-accessor-descriptor", "0.1.6"],
        ["is-data-descriptor", "0.1.4"],
        ["kind-of", "5.1.0"],
        ["is-descriptor", "0.1.6"],
      ]),
    }],
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/"),
      packageDependencies: new Map([
        ["is-accessor-descriptor", "1.0.0"],
        ["is-data-descriptor", "1.0.0"],
        ["kind-of", "6.0.2"],
        ["is-descriptor", "1.0.2"],
      ]),
    }],
  ])],
  ["is-accessor-descriptor", new Map([
    ["0.1.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-accessor-descriptor", "0.1.6"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
        ["is-accessor-descriptor", "1.0.0"],
      ]),
    }],
  ])],
  ["is-data-descriptor", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["is-data-descriptor", "0.1.4"],
      ]),
    }],
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/"),
      packageDependencies: new Map([
        ["kind-of", "6.0.2"],
        ["is-data-descriptor", "1.0.0"],
      ]),
    }],
  ])],
  ["static-extend", new Map([
    ["0.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/"),
      packageDependencies: new Map([
        ["define-property", "0.2.5"],
        ["object-copy", "0.1.0"],
        ["static-extend", "0.1.2"],
      ]),
    }],
  ])],
  ["object-copy", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/"),
      packageDependencies: new Map([
        ["copy-descriptor", "0.1.1"],
        ["define-property", "0.2.5"],
        ["kind-of", "3.2.2"],
        ["object-copy", "0.1.0"],
      ]),
    }],
  ])],
  ["copy-descriptor", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/"),
      packageDependencies: new Map([
        ["copy-descriptor", "0.1.1"],
      ]),
    }],
  ])],
  ["mixin-deep", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/"),
      packageDependencies: new Map([
        ["for-in", "1.0.2"],
        ["is-extendable", "1.0.1"],
        ["mixin-deep", "1.3.1"],
      ]),
    }],
  ])],
  ["for-in", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/"),
      packageDependencies: new Map([
        ["for-in", "1.0.2"],
      ]),
    }],
  ])],
  ["pascalcase", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/"),
      packageDependencies: new Map([
        ["pascalcase", "0.1.1"],
      ]),
    }],
  ])],
  ["map-cache", new Map([
    ["0.2.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/"),
      packageDependencies: new Map([
        ["map-cache", "0.2.2"],
      ]),
    }],
  ])],
  ["source-map", new Map([
    ["0.5.7", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/"),
      packageDependencies: new Map([
        ["source-map", "0.5.7"],
      ]),
    }],
  ])],
  ["source-map-resolve", new Map([
    ["0.5.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/"),
      packageDependencies: new Map([
        ["atob", "2.1.2"],
        ["decode-uri-component", "0.2.0"],
        ["resolve-url", "0.2.1"],
        ["source-map-url", "0.4.0"],
        ["urix", "0.1.0"],
        ["source-map-resolve", "0.5.2"],
      ]),
    }],
  ])],
  ["atob", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/"),
      packageDependencies: new Map([
        ["atob", "2.1.2"],
      ]),
    }],
  ])],
  ["decode-uri-component", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/"),
      packageDependencies: new Map([
        ["decode-uri-component", "0.2.0"],
      ]),
    }],
  ])],
  ["resolve-url", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/"),
      packageDependencies: new Map([
        ["resolve-url", "0.2.1"],
      ]),
    }],
  ])],
  ["source-map-url", new Map([
    ["0.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/"),
      packageDependencies: new Map([
        ["source-map-url", "0.4.0"],
      ]),
    }],
  ])],
  ["urix", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/"),
      packageDependencies: new Map([
        ["urix", "0.1.0"],
      ]),
    }],
  ])],
  ["use", new Map([
    ["3.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/"),
      packageDependencies: new Map([
        ["use", "3.1.1"],
      ]),
    }],
  ])],
  ["snapdragon-node", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/"),
      packageDependencies: new Map([
        ["define-property", "1.0.0"],
        ["isobject", "3.0.1"],
        ["snapdragon-util", "3.0.1"],
        ["snapdragon-node", "2.1.1"],
      ]),
    }],
  ])],
  ["snapdragon-util", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/"),
      packageDependencies: new Map([
        ["kind-of", "3.2.2"],
        ["snapdragon-util", "3.0.1"],
      ]),
    }],
  ])],
  ["to-regex", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/"),
      packageDependencies: new Map([
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["regex-not", "1.0.2"],
        ["safe-regex", "1.1.0"],
        ["to-regex", "3.0.2"],
      ]),
    }],
  ])],
  ["regex-not", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/"),
      packageDependencies: new Map([
        ["extend-shallow", "3.0.2"],
        ["safe-regex", "1.1.0"],
        ["regex-not", "1.0.2"],
      ]),
    }],
  ])],
  ["safe-regex", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/"),
      packageDependencies: new Map([
        ["ret", "0.1.15"],
        ["safe-regex", "1.1.0"],
      ]),
    }],
  ])],
  ["ret", new Map([
    ["0.1.15", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/"),
      packageDependencies: new Map([
        ["ret", "0.1.15"],
      ]),
    }],
  ])],
  ["extglob", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/"),
      packageDependencies: new Map([
        ["array-unique", "0.3.2"],
        ["define-property", "1.0.0"],
        ["expand-brackets", "2.1.4"],
        ["extend-shallow", "2.0.1"],
        ["fragment-cache", "0.2.1"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["extglob", "2.0.4"],
      ]),
    }],
  ])],
  ["expand-brackets", new Map([
    ["2.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["define-property", "0.2.5"],
        ["extend-shallow", "2.0.1"],
        ["posix-character-classes", "0.1.1"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["expand-brackets", "2.1.4"],
      ]),
    }],
  ])],
  ["posix-character-classes", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/"),
      packageDependencies: new Map([
        ["posix-character-classes", "0.1.1"],
      ]),
    }],
  ])],
  ["fragment-cache", new Map([
    ["0.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/"),
      packageDependencies: new Map([
        ["map-cache", "0.2.2"],
        ["fragment-cache", "0.2.1"],
      ]),
    }],
  ])],
  ["nanomatch", new Map([
    ["1.2.13", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/"),
      packageDependencies: new Map([
        ["arr-diff", "4.0.0"],
        ["array-unique", "0.3.2"],
        ["define-property", "2.0.2"],
        ["extend-shallow", "3.0.2"],
        ["fragment-cache", "0.2.1"],
        ["is-windows", "1.0.2"],
        ["kind-of", "6.0.2"],
        ["object.pick", "1.3.0"],
        ["regex-not", "1.0.2"],
        ["snapdragon", "0.8.2"],
        ["to-regex", "3.0.2"],
        ["nanomatch", "1.2.13"],
      ]),
    }],
  ])],
  ["is-windows", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/"),
      packageDependencies: new Map([
        ["is-windows", "1.0.2"],
      ]),
    }],
  ])],
  ["object.pick", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/"),
      packageDependencies: new Map([
        ["isobject", "3.0.1"],
        ["object.pick", "1.3.0"],
      ]),
    }],
  ])],
  ["normalize-path", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/"),
      packageDependencies: new Map([
        ["remove-trailing-separator", "1.1.0"],
        ["normalize-path", "2.1.1"],
      ]),
    }],
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-normalize-path-3.0.0-0dcd69ff23a1c9b11fd0978316644a0388216a65/node_modules/normalize-path/"),
      packageDependencies: new Map([
        ["normalize-path", "3.0.0"],
      ]),
    }],
  ])],
  ["remove-trailing-separator", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/"),
      packageDependencies: new Map([
        ["remove-trailing-separator", "1.1.0"],
      ]),
    }],
  ])],
  ["async-each", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-async-each-1.0.3-b727dbf87d7651602f06f4d4ac387f47d91b0cbf/node_modules/async-each/"),
      packageDependencies: new Map([
        ["async-each", "1.0.3"],
      ]),
    }],
  ])],
  ["glob-parent", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-glob-parent-3.1.0-9e6af6299d8d3bd2bd40430832bd113df906c5ae/node_modules/glob-parent/"),
      packageDependencies: new Map([
        ["is-glob", "3.1.0"],
        ["path-dirname", "1.0.2"],
        ["glob-parent", "3.1.0"],
      ]),
    }],
  ])],
  ["is-glob", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-glob-3.1.0-7ba5ae24217804ac70707b96922567486cc3e84a/node_modules/is-glob/"),
      packageDependencies: new Map([
        ["is-extglob", "2.1.1"],
        ["is-glob", "3.1.0"],
      ]),
    }],
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc/node_modules/is-glob/"),
      packageDependencies: new Map([
        ["is-extglob", "2.1.1"],
        ["is-glob", "4.0.1"],
      ]),
    }],
  ])],
  ["is-extglob", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2/node_modules/is-extglob/"),
      packageDependencies: new Map([
        ["is-extglob", "2.1.1"],
      ]),
    }],
  ])],
  ["path-dirname", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-path-dirname-1.0.2-cc33d24d525e099a5388c0336c6e32b9160609e0/node_modules/path-dirname/"),
      packageDependencies: new Map([
        ["path-dirname", "1.0.2"],
      ]),
    }],
  ])],
  ["is-binary-path", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-binary-path-1.0.1-75f16642b480f187a711c814161fd3a4a7655898/node_modules/is-binary-path/"),
      packageDependencies: new Map([
        ["binary-extensions", "1.13.1"],
        ["is-binary-path", "1.0.1"],
      ]),
    }],
  ])],
  ["binary-extensions", new Map([
    ["1.13.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-binary-extensions-1.13.1-598afe54755b2868a5330d2aff9d4ebb53209b65/node_modules/binary-extensions/"),
      packageDependencies: new Map([
        ["binary-extensions", "1.13.1"],
      ]),
    }],
  ])],
  ["readdirp", new Map([
    ["2.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-readdirp-2.2.1-0e87622a3325aa33e892285caf8b4e846529a525/node_modules/readdirp/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
        ["micromatch", "3.1.10"],
        ["readable-stream", "2.3.6"],
        ["readdirp", "2.2.1"],
      ]),
    }],
  ])],
  ["readable-stream", new Map([
    ["2.3.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/"),
      packageDependencies: new Map([
        ["core-util-is", "1.0.2"],
        ["inherits", "2.0.3"],
        ["isarray", "1.0.0"],
        ["process-nextick-args", "2.0.0"],
        ["safe-buffer", "5.1.2"],
        ["string_decoder", "1.1.1"],
        ["util-deprecate", "1.0.2"],
        ["readable-stream", "2.3.6"],
      ]),
    }],
  ])],
  ["core-util-is", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/"),
      packageDependencies: new Map([
        ["core-util-is", "1.0.2"],
      ]),
    }],
  ])],
  ["process-nextick-args", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/"),
      packageDependencies: new Map([
        ["process-nextick-args", "2.0.0"],
      ]),
    }],
  ])],
  ["safe-buffer", new Map([
    ["5.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
      ]),
    }],
  ])],
  ["string_decoder", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["string_decoder", "1.1.1"],
      ]),
    }],
  ])],
  ["util-deprecate", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/"),
      packageDependencies: new Map([
        ["util-deprecate", "1.0.2"],
      ]),
    }],
  ])],
  ["upath", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-upath-1.1.2-3db658600edaeeccbe6db5e684d67ee8c2acd068/node_modules/upath/"),
      packageDependencies: new Map([
        ["upath", "1.1.2"],
      ]),
    }],
  ])],
  ["fsevents", new Map([
    ["1.2.9", {
      packageLocation: path.resolve(__dirname, "./.pnp/unplugged/npm-fsevents-1.2.9-3f5ed66583ccd6f400b5a00db6f7e861363e388f/node_modules/fsevents/"),
      packageDependencies: new Map([
        ["nan", "2.14.0"],
        ["node-pre-gyp", "0.12.0"],
        ["fsevents", "1.2.9"],
      ]),
    }],
  ])],
  ["nan", new Map([
    ["2.14.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nan-2.14.0-7818f722027b2459a86f0295d434d1fc2336c52c/node_modules/nan/"),
      packageDependencies: new Map([
        ["nan", "2.14.0"],
      ]),
    }],
  ])],
  ["node-pre-gyp", new Map([
    ["0.12.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-node-pre-gyp-0.12.0-39ba4bb1439da030295f899e3b520b7785766149/node_modules/node-pre-gyp/"),
      packageDependencies: new Map([
        ["detect-libc", "1.0.3"],
        ["mkdirp", "0.5.1"],
        ["needle", "2.4.0"],
        ["nopt", "4.0.1"],
        ["npm-packlist", "1.4.1"],
        ["npmlog", "4.1.2"],
        ["rc", "1.2.8"],
        ["rimraf", "2.6.3"],
        ["semver", "5.7.0"],
        ["tar", "4.4.10"],
        ["node-pre-gyp", "0.12.0"],
      ]),
    }],
  ])],
  ["detect-libc", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-detect-libc-1.0.3-fa137c4bd698edf55cd5cd02ac559f91a4c4ba9b/node_modules/detect-libc/"),
      packageDependencies: new Map([
        ["detect-libc", "1.0.3"],
      ]),
    }],
  ])],
  ["needle", new Map([
    ["2.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-needle-2.4.0-6833e74975c444642590e15a750288c5f939b57c/node_modules/needle/"),
      packageDependencies: new Map([
        ["debug", "3.2.6"],
        ["iconv-lite", "0.4.24"],
        ["sax", "1.2.4"],
        ["needle", "2.4.0"],
      ]),
    }],
  ])],
  ["sax", new Map([
    ["1.2.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/"),
      packageDependencies: new Map([
        ["sax", "1.2.4"],
      ]),
    }],
  ])],
  ["nopt", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nopt-4.0.1-d0d4685afd5415193c8c7505602d0d17cd64474d/node_modules/nopt/"),
      packageDependencies: new Map([
        ["abbrev", "1.1.1"],
        ["osenv", "0.1.5"],
        ["nopt", "4.0.1"],
      ]),
    }],
    ["1.0.10", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nopt-1.0.10-6ddd21bd2a31417b92727dd585f8a6f37608ebee/node_modules/nopt/"),
      packageDependencies: new Map([
        ["abbrev", "1.1.1"],
        ["nopt", "1.0.10"],
      ]),
    }],
  ])],
  ["abbrev", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-abbrev-1.1.1-f8f2c887ad10bf67f634f005b6987fed3179aac8/node_modules/abbrev/"),
      packageDependencies: new Map([
        ["abbrev", "1.1.1"],
      ]),
    }],
  ])],
  ["osenv", new Map([
    ["0.1.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-osenv-0.1.5-85cdfafaeb28e8677f416e287592b5f3f49ea410/node_modules/osenv/"),
      packageDependencies: new Map([
        ["os-homedir", "1.0.2"],
        ["os-tmpdir", "1.0.2"],
        ["osenv", "0.1.5"],
      ]),
    }],
  ])],
  ["os-homedir", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/"),
      packageDependencies: new Map([
        ["os-homedir", "1.0.2"],
      ]),
    }],
  ])],
  ["npm-packlist", new Map([
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-npm-packlist-1.4.1-19064cdf988da80ea3cee45533879d90192bbfbc/node_modules/npm-packlist/"),
      packageDependencies: new Map([
        ["ignore-walk", "3.0.1"],
        ["npm-bundled", "1.0.6"],
        ["npm-packlist", "1.4.1"],
      ]),
    }],
  ])],
  ["ignore-walk", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ignore-walk-3.0.1-a83e62e7d272ac0e3b551aaa82831a19b69f82f8/node_modules/ignore-walk/"),
      packageDependencies: new Map([
        ["minimatch", "3.0.4"],
        ["ignore-walk", "3.0.1"],
      ]),
    }],
  ])],
  ["npm-bundled", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-npm-bundled-1.0.6-e7ba9aadcef962bb61248f91721cd932b3fe6bdd/node_modules/npm-bundled/"),
      packageDependencies: new Map([
        ["npm-bundled", "1.0.6"],
      ]),
    }],
  ])],
  ["npmlog", new Map([
    ["4.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-npmlog-4.1.2-08a7f2a8bf734604779a9efa4ad5cc717abb954b/node_modules/npmlog/"),
      packageDependencies: new Map([
        ["are-we-there-yet", "1.1.5"],
        ["console-control-strings", "1.1.0"],
        ["gauge", "2.7.4"],
        ["set-blocking", "2.0.0"],
        ["npmlog", "4.1.2"],
      ]),
    }],
  ])],
  ["are-we-there-yet", new Map([
    ["1.1.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-are-we-there-yet-1.1.5-4b35c2944f062a8bfcda66410760350fe9ddfc21/node_modules/are-we-there-yet/"),
      packageDependencies: new Map([
        ["delegates", "1.0.0"],
        ["readable-stream", "2.3.6"],
        ["are-we-there-yet", "1.1.5"],
      ]),
    }],
  ])],
  ["delegates", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-delegates-1.0.0-84c6e159b81904fdca59a0ef44cd870d31250f9a/node_modules/delegates/"),
      packageDependencies: new Map([
        ["delegates", "1.0.0"],
      ]),
    }],
  ])],
  ["console-control-strings", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-console-control-strings-1.1.0-3d7cf4464db6446ea644bf4b39507f9851008e8e/node_modules/console-control-strings/"),
      packageDependencies: new Map([
        ["console-control-strings", "1.1.0"],
      ]),
    }],
  ])],
  ["gauge", new Map([
    ["2.7.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-gauge-2.7.4-2c03405c7538c39d7eb37b317022e325fb018bf7/node_modules/gauge/"),
      packageDependencies: new Map([
        ["aproba", "1.2.0"],
        ["console-control-strings", "1.1.0"],
        ["has-unicode", "2.0.1"],
        ["object-assign", "4.1.1"],
        ["signal-exit", "3.0.2"],
        ["string-width", "1.0.2"],
        ["strip-ansi", "3.0.1"],
        ["wide-align", "1.1.3"],
        ["gauge", "2.7.4"],
      ]),
    }],
  ])],
  ["aproba", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/"),
      packageDependencies: new Map([
        ["aproba", "1.2.0"],
      ]),
    }],
  ])],
  ["has-unicode", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-unicode-2.0.1-e0e6fe6a28cf51138855e086d1691e771de2a8b9/node_modules/has-unicode/"),
      packageDependencies: new Map([
        ["has-unicode", "2.0.1"],
      ]),
    }],
  ])],
  ["object-assign", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/"),
      packageDependencies: new Map([
        ["object-assign", "4.1.1"],
      ]),
    }],
  ])],
  ["code-point-at", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/"),
      packageDependencies: new Map([
        ["code-point-at", "1.1.0"],
      ]),
    }],
  ])],
  ["number-is-nan", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/"),
      packageDependencies: new Map([
        ["number-is-nan", "1.0.1"],
      ]),
    }],
  ])],
  ["wide-align", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-wide-align-1.1.3-ae074e6bdc0c14a431e804e624549c633b000457/node_modules/wide-align/"),
      packageDependencies: new Map([
        ["string-width", "2.1.1"],
        ["wide-align", "1.1.3"],
      ]),
    }],
  ])],
  ["set-blocking", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/"),
      packageDependencies: new Map([
        ["set-blocking", "2.0.0"],
      ]),
    }],
  ])],
  ["rc", new Map([
    ["1.2.8", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-rc-1.2.8-cd924bf5200a075b83c188cd6b9e211b7fc0d3ed/node_modules/rc/"),
      packageDependencies: new Map([
        ["deep-extend", "0.6.0"],
        ["ini", "1.3.5"],
        ["minimist", "1.2.0"],
        ["strip-json-comments", "2.0.1"],
        ["rc", "1.2.8"],
      ]),
    }],
  ])],
  ["deep-extend", new Map([
    ["0.6.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-deep-extend-0.6.0-c4fa7c95404a17a9c3e8ca7e1537312b736330ac/node_modules/deep-extend/"),
      packageDependencies: new Map([
        ["deep-extend", "0.6.0"],
      ]),
    }],
  ])],
  ["ini", new Map([
    ["1.3.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/"),
      packageDependencies: new Map([
        ["ini", "1.3.5"],
      ]),
    }],
  ])],
  ["tar", new Map([
    ["4.4.10", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-tar-4.4.10-946b2810b9a5e0b26140cf78bea6b0b0d689eba1/node_modules/tar/"),
      packageDependencies: new Map([
        ["chownr", "1.1.1"],
        ["fs-minipass", "1.2.6"],
        ["minipass", "2.3.5"],
        ["minizlib", "1.2.1"],
        ["mkdirp", "0.5.1"],
        ["safe-buffer", "5.1.2"],
        ["yallist", "3.0.3"],
        ["tar", "4.4.10"],
      ]),
    }],
  ])],
  ["chownr", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-chownr-1.1.1-54726b8b8fff4df053c42187e801fb4412df1494/node_modules/chownr/"),
      packageDependencies: new Map([
        ["chownr", "1.1.1"],
      ]),
    }],
  ])],
  ["fs-minipass", new Map([
    ["1.2.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-fs-minipass-1.2.6-2c5cc30ded81282bfe8a0d7c7c1853ddeb102c07/node_modules/fs-minipass/"),
      packageDependencies: new Map([
        ["minipass", "2.3.5"],
        ["fs-minipass", "1.2.6"],
      ]),
    }],
  ])],
  ["minipass", new Map([
    ["2.3.5", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minipass-2.3.5-cacebe492022497f656b0f0f51e2682a9ed2d848/node_modules/minipass/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["yallist", "3.0.3"],
        ["minipass", "2.3.5"],
      ]),
    }],
  ])],
  ["minizlib", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minizlib-1.2.1-dd27ea6136243c7c880684e8672bb3a45fd9b614/node_modules/minizlib/"),
      packageDependencies: new Map([
        ["minipass", "2.3.5"],
        ["minizlib", "1.2.1"],
      ]),
    }],
  ])],
  ["ignore-by-default", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ignore-by-default-1.0.1-48ca6d72f6c6a3af00a9ad4ae6876be3889e2b09/node_modules/ignore-by-default/"),
      packageDependencies: new Map([
        ["ignore-by-default", "1.0.1"],
      ]),
    }],
  ])],
  ["pstree.remy", new Map([
    ["1.1.7", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-pstree-remy-1.1.7-c76963a28047ed61542dc361aa26ee55a7fa15f3/node_modules/pstree.remy/"),
      packageDependencies: new Map([
        ["pstree.remy", "1.1.7"],
      ]),
    }],
  ])],
  ["touch", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-touch-3.1.0-fe365f5f75ec9ed4e56825e0bb76d24ab74af83b/node_modules/touch/"),
      packageDependencies: new Map([
        ["nopt", "1.0.10"],
        ["touch", "3.1.0"],
      ]),
    }],
  ])],
  ["undefsafe", new Map([
    ["2.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-undefsafe-2.0.2-225f6b9e0337663e0d8e7cfd686fc2836ccace76/node_modules/undefsafe/"),
      packageDependencies: new Map([
        ["debug", "2.6.9"],
        ["undefsafe", "2.0.2"],
      ]),
    }],
  ])],
  ["update-notifier", new Map([
    ["2.5.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-update-notifier-2.5.0-d0744593e13f161e406acb1d9408b72cad08aff6/node_modules/update-notifier/"),
      packageDependencies: new Map([
        ["boxen", "1.3.0"],
        ["chalk", "2.4.2"],
        ["configstore", "3.1.2"],
        ["import-lazy", "2.1.0"],
        ["is-ci", "1.2.1"],
        ["is-installed-globally", "0.1.0"],
        ["is-npm", "1.0.0"],
        ["latest-version", "3.1.0"],
        ["semver-diff", "2.1.0"],
        ["xdg-basedir", "3.0.0"],
        ["update-notifier", "2.5.0"],
      ]),
    }],
  ])],
  ["boxen", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-boxen-1.3.0-55c6c39a8ba58d9c61ad22cd877532deb665a20b/node_modules/boxen/"),
      packageDependencies: new Map([
        ["ansi-align", "2.0.0"],
        ["camelcase", "4.1.0"],
        ["chalk", "2.4.2"],
        ["cli-boxes", "1.0.0"],
        ["string-width", "2.1.1"],
        ["term-size", "1.2.0"],
        ["widest-line", "2.0.1"],
        ["boxen", "1.3.0"],
      ]),
    }],
  ])],
  ["ansi-align", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ansi-align-2.0.0-c36aeccba563b89ceb556f3690f0b1d9e3547f7f/node_modules/ansi-align/"),
      packageDependencies: new Map([
        ["string-width", "2.1.1"],
        ["ansi-align", "2.0.0"],
      ]),
    }],
  ])],
  ["camelcase", new Map([
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/"),
      packageDependencies: new Map([
        ["camelcase", "4.1.0"],
      ]),
    }],
  ])],
  ["cli-boxes", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-cli-boxes-1.0.0-4fa917c3e59c94a004cd61f8ee509da651687143/node_modules/cli-boxes/"),
      packageDependencies: new Map([
        ["cli-boxes", "1.0.0"],
      ]),
    }],
  ])],
  ["term-size", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-term-size-1.2.0-458b83887f288fc56d6fffbfad262e26638efa69/node_modules/term-size/"),
      packageDependencies: new Map([
        ["execa", "0.7.0"],
        ["term-size", "1.2.0"],
      ]),
    }],
  ])],
  ["widest-line", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-widest-line-2.0.1-7438764730ec7ef4381ce4df82fb98a53142a3fc/node_modules/widest-line/"),
      packageDependencies: new Map([
        ["string-width", "2.1.1"],
        ["widest-line", "2.0.1"],
      ]),
    }],
  ])],
  ["configstore", new Map([
    ["3.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-configstore-3.1.2-c6f25defaeef26df12dd33414b001fe81a543f8f/node_modules/configstore/"),
      packageDependencies: new Map([
        ["dot-prop", "4.2.0"],
        ["graceful-fs", "4.1.15"],
        ["make-dir", "1.3.0"],
        ["unique-string", "1.0.0"],
        ["write-file-atomic", "2.4.3"],
        ["xdg-basedir", "3.0.0"],
        ["configstore", "3.1.2"],
      ]),
    }],
  ])],
  ["dot-prop", new Map([
    ["4.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-dot-prop-4.2.0-1f19e0c2e1aa0e32797c49799f2837ac6af69c57/node_modules/dot-prop/"),
      packageDependencies: new Map([
        ["is-obj", "1.0.1"],
        ["dot-prop", "4.2.0"],
      ]),
    }],
  ])],
  ["is-obj", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-obj-1.0.1-3e4729ac1f5fde025cd7d83a896dab9f4f67db0f/node_modules/is-obj/"),
      packageDependencies: new Map([
        ["is-obj", "1.0.1"],
      ]),
    }],
  ])],
  ["make-dir", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-make-dir-1.3.0-79c1033b80515bd6d24ec9933e860ca75ee27f0c/node_modules/make-dir/"),
      packageDependencies: new Map([
        ["pify", "3.0.0"],
        ["make-dir", "1.3.0"],
      ]),
    }],
  ])],
  ["unique-string", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-unique-string-1.0.0-9e1057cca851abb93398f8b33ae187b99caec11a/node_modules/unique-string/"),
      packageDependencies: new Map([
        ["crypto-random-string", "1.0.0"],
        ["unique-string", "1.0.0"],
      ]),
    }],
  ])],
  ["crypto-random-string", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-crypto-random-string-1.0.0-a230f64f568310e1498009940790ec99545bca7e/node_modules/crypto-random-string/"),
      packageDependencies: new Map([
        ["crypto-random-string", "1.0.0"],
      ]),
    }],
  ])],
  ["write-file-atomic", new Map([
    ["2.4.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-write-file-atomic-2.4.3-1fd2e9ae1df3e75b8d8c367443c692d4ca81f481/node_modules/write-file-atomic/"),
      packageDependencies: new Map([
        ["graceful-fs", "4.1.15"],
        ["imurmurhash", "0.1.4"],
        ["signal-exit", "3.0.2"],
        ["write-file-atomic", "2.4.3"],
      ]),
    }],
  ])],
  ["xdg-basedir", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-xdg-basedir-3.0.0-496b2cc109eca8dbacfe2dc72b603c17c5870ad4/node_modules/xdg-basedir/"),
      packageDependencies: new Map([
        ["xdg-basedir", "3.0.0"],
      ]),
    }],
  ])],
  ["import-lazy", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-import-lazy-2.1.0-05698e3d45c88e8d7e9d92cb0584e77f096f3e43/node_modules/import-lazy/"),
      packageDependencies: new Map([
        ["import-lazy", "2.1.0"],
      ]),
    }],
  ])],
  ["is-ci", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-ci-1.2.1-e3779c8ee17fccf428488f6e281187f2e632841c/node_modules/is-ci/"),
      packageDependencies: new Map([
        ["ci-info", "1.6.0"],
        ["is-ci", "1.2.1"],
      ]),
    }],
  ])],
  ["ci-info", new Map([
    ["1.6.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ci-info-1.6.0-2ca20dbb9ceb32d4524a683303313f0304b1e497/node_modules/ci-info/"),
      packageDependencies: new Map([
        ["ci-info", "1.6.0"],
      ]),
    }],
  ])],
  ["is-installed-globally", new Map([
    ["0.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-installed-globally-0.1.0-0dfd98f5a9111716dd535dda6492f67bf3d25a80/node_modules/is-installed-globally/"),
      packageDependencies: new Map([
        ["global-dirs", "0.1.1"],
        ["is-path-inside", "1.0.1"],
        ["is-installed-globally", "0.1.0"],
      ]),
    }],
  ])],
  ["global-dirs", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-global-dirs-0.1.1-b319c0dd4607f353f3be9cca4c72fc148c49f445/node_modules/global-dirs/"),
      packageDependencies: new Map([
        ["ini", "1.3.5"],
        ["global-dirs", "0.1.1"],
      ]),
    }],
  ])],
  ["is-path-inside", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-path-inside-1.0.1-8ef5b7de50437a3fdca6b4e865ef7aa55cb48036/node_modules/is-path-inside/"),
      packageDependencies: new Map([
        ["path-is-inside", "1.0.2"],
        ["is-path-inside", "1.0.1"],
      ]),
    }],
  ])],
  ["is-npm", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-npm-1.0.0-f2fb63a65e4905b406c86072765a1a4dc793b9f4/node_modules/is-npm/"),
      packageDependencies: new Map([
        ["is-npm", "1.0.0"],
      ]),
    }],
  ])],
  ["latest-version", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-latest-version-3.1.0-a205383fea322b33b5ae3b18abee0dc2f356ee15/node_modules/latest-version/"),
      packageDependencies: new Map([
        ["package-json", "4.0.1"],
        ["latest-version", "3.1.0"],
      ]),
    }],
  ])],
  ["package-json", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-package-json-4.0.1-8869a0401253661c4c4ca3da6c2121ed555f5eed/node_modules/package-json/"),
      packageDependencies: new Map([
        ["got", "6.7.1"],
        ["registry-auth-token", "3.4.0"],
        ["registry-url", "3.1.0"],
        ["semver", "5.7.0"],
        ["package-json", "4.0.1"],
      ]),
    }],
  ])],
  ["got", new Map([
    ["6.7.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-got-6.7.1-240cd05785a9a18e561dc1b44b41c763ef1e8db0/node_modules/got/"),
      packageDependencies: new Map([
        ["create-error-class", "3.0.2"],
        ["duplexer3", "0.1.4"],
        ["get-stream", "3.0.0"],
        ["is-redirect", "1.0.0"],
        ["is-retry-allowed", "1.1.0"],
        ["is-stream", "1.1.0"],
        ["lowercase-keys", "1.0.1"],
        ["safe-buffer", "5.1.2"],
        ["timed-out", "4.0.1"],
        ["unzip-response", "2.0.1"],
        ["url-parse-lax", "1.0.0"],
        ["got", "6.7.1"],
      ]),
    }],
  ])],
  ["create-error-class", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-create-error-class-3.0.2-06be7abef947a3f14a30fd610671d401bca8b7b6/node_modules/create-error-class/"),
      packageDependencies: new Map([
        ["capture-stack-trace", "1.0.1"],
        ["create-error-class", "3.0.2"],
      ]),
    }],
  ])],
  ["capture-stack-trace", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-capture-stack-trace-1.0.1-a6c0bbe1f38f3aa0b92238ecb6ff42c344d4135d/node_modules/capture-stack-trace/"),
      packageDependencies: new Map([
        ["capture-stack-trace", "1.0.1"],
      ]),
    }],
  ])],
  ["duplexer3", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-duplexer3-0.1.4-ee01dd1cac0ed3cbc7fdbea37dc0a8f1ce002ce2/node_modules/duplexer3/"),
      packageDependencies: new Map([
        ["duplexer3", "0.1.4"],
      ]),
    }],
  ])],
  ["is-redirect", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-redirect-1.0.0-1d03dded53bd8db0f30c26e4f95d36fc7c87dc24/node_modules/is-redirect/"),
      packageDependencies: new Map([
        ["is-redirect", "1.0.0"],
      ]),
    }],
  ])],
  ["is-retry-allowed", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-retry-allowed-1.1.0-11a060568b67339444033d0125a61a20d564fb34/node_modules/is-retry-allowed/"),
      packageDependencies: new Map([
        ["is-retry-allowed", "1.1.0"],
      ]),
    }],
  ])],
  ["lowercase-keys", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-lowercase-keys-1.0.1-6f9e30b47084d971a7c820ff15a6c5167b74c26f/node_modules/lowercase-keys/"),
      packageDependencies: new Map([
        ["lowercase-keys", "1.0.1"],
      ]),
    }],
  ])],
  ["timed-out", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-timed-out-4.0.1-f32eacac5a175bea25d7fab565ab3ed8741ef56f/node_modules/timed-out/"),
      packageDependencies: new Map([
        ["timed-out", "4.0.1"],
      ]),
    }],
  ])],
  ["unzip-response", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-unzip-response-2.0.1-d2f0f737d16b0615e72a6935ed04214572d56f97/node_modules/unzip-response/"),
      packageDependencies: new Map([
        ["unzip-response", "2.0.1"],
      ]),
    }],
  ])],
  ["url-parse-lax", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-url-parse-lax-1.0.0-7af8f303645e9bd79a272e7a14ac68bc0609da73/node_modules/url-parse-lax/"),
      packageDependencies: new Map([
        ["prepend-http", "1.0.4"],
        ["url-parse-lax", "1.0.0"],
      ]),
    }],
  ])],
  ["prepend-http", new Map([
    ["1.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-prepend-http-1.0.4-d4f4562b0ce3696e41ac52d0e002e57a635dc6dc/node_modules/prepend-http/"),
      packageDependencies: new Map([
        ["prepend-http", "1.0.4"],
      ]),
    }],
  ])],
  ["registry-auth-token", new Map([
    ["3.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-registry-auth-token-3.4.0-d7446815433f5d5ed6431cd5dca21048f66b397e/node_modules/registry-auth-token/"),
      packageDependencies: new Map([
        ["rc", "1.2.8"],
        ["safe-buffer", "5.1.2"],
        ["registry-auth-token", "3.4.0"],
      ]),
    }],
  ])],
  ["registry-url", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-registry-url-3.1.0-3d4ef870f73dde1d77f0cf9a381432444e174942/node_modules/registry-url/"),
      packageDependencies: new Map([
        ["rc", "1.2.8"],
        ["registry-url", "3.1.0"],
      ]),
    }],
  ])],
  ["semver-diff", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-semver-diff-2.1.0-4bbb8437c8d37e4b0cf1a68fd726ec6d645d6d36/node_modules/semver-diff/"),
      packageDependencies: new Map([
        ["semver", "5.7.0"],
        ["semver-diff", "2.1.0"],
      ]),
    }],
  ])],
  [null, new Map([
    [null, {
      packageLocation: path.resolve(__dirname, "./"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["commander", "2.20.0"],
        ["default-pager", "1.1.0"],
        ["git-commit-count", "1.1.3"],
        ["inquirer", "6.3.1"],
        ["simple-git", "1.115.0"],
        ["eslint", "5.16.0"],
        ["eslint-config-airbnb-base", "13.1.0"],
        ["eslint-plugin-import", "2.17.3"],
        ["nodemon", "1.19.1"],
      ]),
    }],
  ])],
]);

let locatorsByLocations = new Map([
  ["../../../Library/Caches/Yarn/v4/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424/node_modules/chalk/", {"name":"chalk","reference":"2.4.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d/node_modules/ansi-styles/", {"name":"ansi-styles","reference":"3.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8/node_modules/color-convert/", {"name":"color-convert","reference":"1.9.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25/node_modules/color-name/", {"name":"color-name","reference":"1.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4/node_modules/escape-string-regexp/", {"name":"escape-string-regexp","reference":"1.0.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f/node_modules/supports-color/", {"name":"supports-color","reference":"5.5.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd/node_modules/has-flag/", {"name":"has-flag","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-commander-2.20.0-d58bb2b5c1ee8f87b0d340027e9e94e222c5a422/node_modules/commander/", {"name":"commander","reference":"2.20.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-default-pager-1.1.0-ed28895b04a96e37078bdc62239131971620eeec/node_modules/default-pager/", {"name":"default-pager","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-git-commit-count-1.1.3-1e9babc887c056a65afed58af9d84a209e6009e3/node_modules/git-commit-count/", {"name":"git-commit-count","reference":"1.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-execa-0.6.3-57b69a594f081759c69e5370f0d17b9cb11658fe/node_modules/execa/", {"name":"execa","reference":"0.6.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-execa-0.7.0-944becd34cc41ee32a63a9faf27ad5a65fc59777/node_modules/execa/", {"name":"execa","reference":"0.7.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-cross-spawn-5.1.0-e8bd0efee58fcff6f8f94510a0a554bbfa235449/node_modules/cross-spawn/", {"name":"cross-spawn","reference":"5.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4/node_modules/cross-spawn/", {"name":"cross-spawn","reference":"6.0.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-lru-cache-4.1.5-8bbe50ea85bed59bc9e33dcab8235ee9bcf443cd/node_modules/lru-cache/", {"name":"lru-cache","reference":"4.1.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-pseudomap-1.0.2-f052a28da70e618917ef0a8ac34c1ae5a68286b3/node_modules/pseudomap/", {"name":"pseudomap","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-yallist-2.1.2-1c11f9218f076089a47dd512f93c6699a6a81d52/node_modules/yallist/", {"name":"yallist","reference":"2.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-yallist-3.0.3-b4b049e314be545e3ce802236d6cd22cd91c3de9/node_modules/yallist/", {"name":"yallist","reference":"3.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea/node_modules/shebang-command/", {"name":"shebang-command","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3/node_modules/shebang-regex/", {"name":"shebang-regex","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a/node_modules/which/", {"name":"which","reference":"1.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10/node_modules/isexe/", {"name":"isexe","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/", {"name":"get-stream","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/", {"name":"is-stream","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-npm-run-path-2.0.2-35a9232dfa35d7067b4cb2ddf2357b1871536c5f/node_modules/npm-run-path/", {"name":"npm-run-path","reference":"2.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40/node_modules/path-key/", {"name":"path-key","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/", {"name":"p-finally","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d/node_modules/signal-exit/", {"name":"signal-exit","reference":"3.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-eof-1.0.0-bb43ff5598a6eb05d89b59fcd129c983313606bf/node_modules/strip-eof/", {"name":"strip-eof","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-git-repository-1.1.1-c68e4b7a806422349aaec488973a90558d7e9be0/node_modules/is-git-repository/", {"name":"is-git-repository","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f/node_modules/path-is-absolute/", {"name":"path-is-absolute","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-inquirer-6.3.1-7a413b5e7950811013a3db491c61d1f3b776e8e7/node_modules/inquirer/", {"name":"inquirer","reference":"6.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-escapes-3.2.0-8780b98ff9dbf5638152d1f1fe5c1d7b4442976b/node_modules/ansi-escapes/", {"name":"ansi-escapes","reference":"3.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-cli-cursor-2.1.0-b35dac376479facc3e94747d41d0d0f5238ffcb5/node_modules/cli-cursor/", {"name":"cli-cursor","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-restore-cursor-2.0.0-9f7ee287f82fd326d4fd162923d62129eee0dfaf/node_modules/restore-cursor/", {"name":"restore-cursor","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-onetime-2.0.1-067428230fd67443b2794b22bba528b6867962d4/node_modules/onetime/", {"name":"onetime","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-mimic-fn-1.2.0-820c86a39334640e99516928bd03fca88057d022/node_modules/mimic-fn/", {"name":"mimic-fn","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639/node_modules/cli-width/", {"name":"cli-width","reference":"2.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-external-editor-3.0.3-5866db29a97826dbe4bf3afd24070ead9ea43a27/node_modules/external-editor/", {"name":"external-editor","reference":"3.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e/node_modules/chardet/", {"name":"chardet","reference":"0.7.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/", {"name":"iconv-lite","reference":"0.4.24"}],
  ["../../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/", {"name":"safer-buffer","reference":"2.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9/node_modules/tmp/", {"name":"tmp","reference":"0.0.33"}],
  ["../../../Library/Caches/Yarn/v4/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274/node_modules/os-tmpdir/", {"name":"os-tmpdir","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-figures-2.0.0-3ab1a2d2a62c8bfb431a0c94cb797a2fce27c962/node_modules/figures/", {"name":"figures","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/", {"name":"lodash","reference":"4.17.11"}],
  ["../../../Library/Caches/Yarn/v4/npm-mute-stream-0.0.7-3075ce93bc21b8fab43e1bc4da7e8115ed1e7bab/node_modules/mute-stream/", {"name":"mute-stream","reference":"0.0.7"}],
  ["../../../Library/Caches/Yarn/v4/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0/node_modules/run-async/", {"name":"run-async","reference":"2.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa/node_modules/is-promise/", {"name":"is-promise","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-rxjs-6.5.2-2e35ce815cd46d84d02a209fb4e5921e051dbec7/node_modules/rxjs/", {"name":"rxjs","reference":"6.5.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a/node_modules/tslib/", {"name":"tslib","reference":"1.10.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-string-width-2.1.1-ab93f27a8dc13d28cac815c462143a6d9012ae9e/node_modules/string-width/", {"name":"string-width","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961/node_modules/string-width/", {"name":"string-width","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-string-width-1.0.2-118bdf5b8cdc51a2a7e70d211e07e2b0b9b107d3/node_modules/string-width/", {"name":"string-width","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-fullwidth-code-point-1.0.0-ef9e31386f031a7f0d643af82fde50c457ef00cb/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-ansi-4.0.0-a8479022eb1ac368a871389b635262c505ee368f/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"5.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-ansi-3.0.1-6a385fb8853d952d5ff05d0e8aaf94278dc63dcf/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"3.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-regex-3.0.0-ed0317c322064f79466c02966bddb605ab37d998/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"4.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-regex-2.1.1-c3b33ab5ee360d86e0e628f0468ae7ef27d654df/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5/node_modules/through/", {"name":"through","reference":"2.3.8"}],
  ["../../../Library/Caches/Yarn/v4/npm-simple-git-1.115.0-159a49cf95c5126d5903e36df67504a8c634e817/node_modules/simple-git/", {"name":"simple-git","reference":"1.115.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791/node_modules/debug/", {"name":"debug","reference":"4.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-debug-2.6.9-5d128515df134ff327e90a4c93f4e077a536341f/node_modules/debug/", {"name":"debug","reference":"2.6.9"}],
  ["../../../Library/Caches/Yarn/v4/npm-debug-3.2.6-e83d17de16d8a7efb7717edbe5fb10135eee629b/node_modules/debug/", {"name":"debug","reference":"3.2.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009/node_modules/ms/", {"name":"ms","reference":"2.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8/node_modules/ms/", {"name":"ms","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-5.16.0-a1e3ac1aae4a3fbd8296fcf8f7ab7314cbb6abea/node_modules/eslint/", {"name":"eslint","reference":"5.16.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-@babel-code-frame-7.0.0-06e2ab19bdb535385559aabb5ba59729482800f8/node_modules/@babel/code-frame/", {"name":"@babel/code-frame","reference":"7.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-@babel-highlight-7.0.0-f710c38c8d458e6dd9a201afb637fcb781ce99e4/node_modules/@babel/highlight/", {"name":"@babel/highlight","reference":"7.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-esutils-2.0.2-0abf4f1caa5bcb1f7a9d8acc6dea4faaa04bac9b/node_modules/esutils/", {"name":"esutils","reference":"2.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499/node_modules/js-tokens/", {"name":"js-tokens","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ajv-6.10.0-90d0d54439da587cd7e843bfb7045f50bd22bdf1/node_modules/ajv/", {"name":"ajv","reference":"6.10.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49/node_modules/fast-deep-equal/", {"name":"fast-deep-equal","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-fast-json-stable-stringify-2.0.0-d5142c0caee6b1189f87d3a76111064f86c8bbf2/node_modules/fast-json-stable-stringify/", {"name":"fast-json-stable-stringify","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660/node_modules/json-schema-traverse/", {"name":"json-schema-traverse","reference":"0.4.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0/node_modules/uri-js/", {"name":"uri-js","reference":"4.2.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec/node_modules/punycode/", {"name":"punycode","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366/node_modules/nice-try/", {"name":"nice-try","reference":"1.0.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-semver-5.7.0-790a7cf6fea5459bac96110b29b60412dc8ff96b/node_modules/semver/", {"name":"semver","reference":"5.7.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961/node_modules/doctrine/", {"name":"doctrine","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-doctrine-1.5.0-379dce730f6166f76cefa4e6707a159b02c5a6fa/node_modules/doctrine/", {"name":"doctrine","reference":"1.5.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-scope-4.0.3-ca03833310f6889a3264781aa82e63eb9cfe7848/node_modules/eslint-scope/", {"name":"eslint-scope","reference":"4.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf/node_modules/esrecurse/", {"name":"esrecurse","reference":"4.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-estraverse-4.2.0-0dee3fed31fcd469618ce7342099fc1afa0bdb13/node_modules/estraverse/", {"name":"estraverse","reference":"4.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-utils-1.3.1-9a851ba89ee7c460346f97cf8939c7298827e512/node_modules/eslint-utils/", {"name":"eslint-utils","reference":"1.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-visitor-keys-1.0.0-3f3180fb2e291017716acb4c9d6d5b5c34a6a81d/node_modules/eslint-visitor-keys/", {"name":"eslint-visitor-keys","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-espree-5.0.1-5d6526fa4fc7f0788a5cf75b15f30323e2f81f7a/node_modules/espree/", {"name":"espree","reference":"5.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-acorn-6.1.1-7d25ae05bb8ad1f9b699108e1094ecd7884adc1f/node_modules/acorn/", {"name":"acorn","reference":"6.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-acorn-jsx-5.0.1-32a064fd925429216a09b141102bfdd185fae40e/node_modules/acorn-jsx/", {"name":"acorn-jsx","reference":"5.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708/node_modules/esquery/", {"name":"esquery","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c/node_modules/file-entry-cache/", {"name":"file-entry-cache","reference":"5.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0/node_modules/flat-cache/", {"name":"flat-cache","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-flatted-2.0.0-55122b6536ea496b4b44893ee2608141d10d9916/node_modules/flatted/", {"name":"flatted","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab/node_modules/rimraf/", {"name":"rimraf","reference":"2.6.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-glob-7.1.4-aa608a2f6c577ad357e1ae5a5c26d9a8d1969255/node_modules/glob/", {"name":"glob","reference":"7.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f/node_modules/fs.realpath/", {"name":"fs.realpath","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9/node_modules/inflight/", {"name":"inflight","reference":"1.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1/node_modules/once/", {"name":"once","reference":"1.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f/node_modules/wrappy/", {"name":"wrappy","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-inherits-2.0.3-633c2c83e3da42a502f52466022480f4208261de/node_modules/inherits/", {"name":"inherits","reference":"2.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083/node_modules/minimatch/", {"name":"minimatch","reference":"3.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd/node_modules/brace-expansion/", {"name":"brace-expansion","reference":"1.1.11"}],
  ["../../../Library/Caches/Yarn/v4/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767/node_modules/balanced-match/", {"name":"balanced-match","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b/node_modules/concat-map/", {"name":"concat-map","reference":"0.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3/node_modules/write/", {"name":"write","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903/node_modules/mkdirp/", {"name":"mkdirp","reference":"0.5.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d/node_modules/minimist/", {"name":"minimist","reference":"0.0.8"}],
  ["../../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/", {"name":"minimist","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327/node_modules/functional-red-black-tree/", {"name":"functional-red-black-tree","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-globals-11.12.0-ab8795338868a0babd8525758018c2a7eb95c42e/node_modules/globals/", {"name":"globals","reference":"11.12.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc/node_modules/ignore/", {"name":"ignore","reference":"4.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-import-fresh-3.0.0-a3d897f420cab0e671236897f75bc14b4885c390/node_modules/import-fresh/", {"name":"import-fresh","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-parent-module-1.0.1-691d2709e78c79fae3a156622452d00762caaaa2/node_modules/parent-module/", {"name":"parent-module","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-callsites-3.1.0-b3630abd8943432f54b3f0519238e33cd7df2f73/node_modules/callsites/", {"name":"callsites","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6/node_modules/resolve-from/", {"name":"resolve-from","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea/node_modules/imurmurhash/", {"name":"imurmurhash","reference":"0.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-js-yaml-3.13.1-aff151b30bfdfa8e49e05da22e7415e9dfa37847/node_modules/js-yaml/", {"name":"js-yaml","reference":"3.13.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911/node_modules/argparse/", {"name":"argparse","reference":"1.0.10"}],
  ["../../../Library/Caches/Yarn/v4/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c/node_modules/sprintf-js/", {"name":"sprintf-js","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71/node_modules/esprima/", {"name":"esprima","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651/node_modules/json-stable-stringify-without-jsonify/", {"name":"json-stable-stringify-without-jsonify","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee/node_modules/levn/", {"name":"levn","reference":"0.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54/node_modules/prelude-ls/", {"name":"prelude-ls","reference":"1.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72/node_modules/type-check/", {"name":"type-check","reference":"0.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7/node_modules/natural-compare/", {"name":"natural-compare","reference":"1.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-optionator-0.8.2-364c5e409d3f4d6301d6c0b4c05bba50180aeb64/node_modules/optionator/", {"name":"optionator","reference":"0.8.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34/node_modules/deep-is/", {"name":"deep-is","reference":"0.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917/node_modules/fast-levenshtein/", {"name":"fast-levenshtein","reference":"2.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-wordwrap-1.0.0-27584810891456a4171c8d0226441ade90cbcaeb/node_modules/wordwrap/", {"name":"wordwrap","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-is-inside-1.0.2-365417dede44430d1c11af61027facf074bdfc53/node_modules/path-is-inside/", {"name":"path-is-inside","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8/node_modules/progress/", {"name":"progress","reference":"2.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f/node_modules/regexpp/", {"name":"regexpp","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-json-comments-2.0.1-3c531942e908c2697c0ec344858c286c7ca0a60a/node_modules/strip-json-comments/", {"name":"strip-json-comments","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-table-5.4.0-d772a3216e68829920a41a32c18eda286c95d780/node_modules/table/", {"name":"table","reference":"5.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636/node_modules/slice-ansi/", {"name":"slice-ansi","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9/node_modules/astral-regex/", {"name":"astral-regex","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156/node_modules/emoji-regex/", {"name":"emoji-regex","reference":"7.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4/node_modules/text-table/", {"name":"text-table","reference":"0.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-config-airbnb-base-13.1.0-b5a1b480b80dfad16433d6c4ad84e6605052c05c/node_modules/eslint-config-airbnb-base/", {"name":"eslint-config-airbnb-base","reference":"13.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-restricted-globals-0.1.1-35f0d5cbc64c2e3ed62e93b4b1a7af05ba7ed4d7/node_modules/eslint-restricted-globals/", {"name":"eslint-restricted-globals","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-assign-4.1.0-968bf1100d7956bb3ca086f006f846b3bc4008da/node_modules/object.assign/", {"name":"object.assign","reference":"4.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-define-properties-1.1.3-cf88da6cbee26fe6db7094f61d870cbd84cee9f1/node_modules/define-properties/", {"name":"define-properties","reference":"1.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-keys-1.1.1-1c47f272df277f3b1daf061677d9c82e2322c60e/node_modules/object-keys/", {"name":"object-keys","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-function-bind-1.1.1-a56899d3ea3c9bab874bb9773b7c5ede92f4895d/node_modules/function-bind/", {"name":"function-bind","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-symbols-1.0.0-ba1a8f1af2a0fc39650f5c850367704122063b44/node_modules/has-symbols/", {"name":"has-symbols","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-entries-1.1.0-2024fc6d6ba246aee38bdb0ffd5cfbcf371b7519/node_modules/object.entries/", {"name":"object.entries","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-es-abstract-1.13.0-ac86145fdd5099d8dd49558ccba2eaf9b88e24e9/node_modules/es-abstract/", {"name":"es-abstract","reference":"1.13.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-es-to-primitive-1.2.0-edf72478033456e8dda8ef09e00ad9650707f377/node_modules/es-to-primitive/", {"name":"es-to-primitive","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-callable-1.1.4-1e1adf219e1eeb684d691f9d6a05ff0d30a24d75/node_modules/is-callable/", {"name":"is-callable","reference":"1.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-date-object-1.0.1-9aa20eb6aeebbff77fbd33e74ca01b33581d3a16/node_modules/is-date-object/", {"name":"is-date-object","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-symbol-1.0.2-a055f6ae57192caee329e7a860118b497a950f38/node_modules/is-symbol/", {"name":"is-symbol","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-1.0.3-722d7cbfc1f6aa8241f16dd814e011e1f41e8796/node_modules/has/", {"name":"has","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-regex-1.0.4-5517489b547091b0930e095654ced25ee97e9491/node_modules/is-regex/", {"name":"is-regex","reference":"1.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-plugin-import-2.17.3-00548b4434c18faebaba04b24ae6198f280de189/node_modules/eslint-plugin-import/", {"name":"eslint-plugin-import","reference":"2.17.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-array-includes-3.0.3-184b48f62d92d7452bb31b323165c7f8bd02266d/node_modules/array-includes/", {"name":"array-includes","reference":"3.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-contains-path-0.1.0-fe8cf184ff6670b6baef01a9d4861a5cbec4120a/node_modules/contains-path/", {"name":"contains-path","reference":"0.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/", {"name":"isarray","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-import-resolver-node-0.3.2-58f15fb839b8d0576ca980413476aab2472db66a/node_modules/eslint-import-resolver-node/", {"name":"eslint-import-resolver-node","reference":"0.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-resolve-1.11.0-4014870ba296176b86343d50b60f3b50609ce232/node_modules/resolve/", {"name":"resolve","reference":"1.11.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-parse-1.0.6-d62dbb5679405d72c4737ec58600e9ddcf06d24c/node_modules/path-parse/", {"name":"path-parse","reference":"1.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-eslint-module-utils-2.4.0-8b93499e9b00eab80ccb6614e69f03678e84e09a/node_modules/eslint-module-utils/", {"name":"eslint-module-utils","reference":"2.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-pkg-dir-2.0.0-f6d5d1109e19d63edf428e0bd57e12777615334b/node_modules/pkg-dir/", {"name":"pkg-dir","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-find-up-2.1.0-45d1b7e506c717ddd482775a2b77920a3c0c57a7/node_modules/find-up/", {"name":"find-up","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-locate-path-2.0.0-2b568b265eec944c6d9c0de9c3dbbbca0354cd8e/node_modules/locate-path/", {"name":"locate-path","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-locate-2.0.0-20a0103b222a70c8fd39cc2e580680f3dde5ec43/node_modules/p-locate/", {"name":"p-locate","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-limit-1.3.0-b86bd5f0c25690911c7590fcbfc2010d54b3ccb8/node_modules/p-limit/", {"name":"p-limit","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-try-1.0.0-cbc79cdbaf8fd4228e13f621f2b1a237c1b207b3/node_modules/p-try/", {"name":"p-try","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-exists-3.0.0-ce0ebeaa5f78cb18925ea7d810d7b59b010fd515/node_modules/path-exists/", {"name":"path-exists","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-read-pkg-up-2.0.0-6b72a8048984e0c41e79510fd5e9fa99b3b549be/node_modules/read-pkg-up/", {"name":"read-pkg-up","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-read-pkg-2.0.0-8ef1c0623c6a6db0dc6713c4bfac46332b2368f8/node_modules/read-pkg/", {"name":"read-pkg","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-load-json-file-2.0.0-7947e42149af80d696cbf797bcaabcfe1fe29ca8/node_modules/load-json-file/", {"name":"load-json-file","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-graceful-fs-4.1.15-ffb703e1066e8a0eeaa4c8b80ba9253eeefbfb00/node_modules/graceful-fs/", {"name":"graceful-fs","reference":"4.1.15"}],
  ["../../../Library/Caches/Yarn/v4/npm-parse-json-2.2.0-f480f40434ef80741f8469099f8dea18f55a4dc9/node_modules/parse-json/", {"name":"parse-json","reference":"2.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-error-ex-1.3.2-b4ac40648107fdcdcfae242f428bea8a14d4f1bf/node_modules/error-ex/", {"name":"error-ex","reference":"1.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-arrayish-0.2.1-77c99840527aa8ecb1a8ba697b80645a7a926a9d/node_modules/is-arrayish/", {"name":"is-arrayish","reference":"0.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-pify-2.3.0-ed141a6ac043a849ea588498e7dca8b15330e90c/node_modules/pify/", {"name":"pify","reference":"2.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-pify-3.0.0-e5a4acd2c101fdf3d9a4d07f0dbc4db49dd28176/node_modules/pify/", {"name":"pify","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-strip-bom-3.0.0-2334c18e9c759f7bdd56fdef7e9ae3d588e68ed3/node_modules/strip-bom/", {"name":"strip-bom","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-normalize-package-data-2.5.0-e66db1838b200c1dfc233225d12cb36520e234a8/node_modules/normalize-package-data/", {"name":"normalize-package-data","reference":"2.5.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-hosted-git-info-2.7.1-97f236977bd6e125408930ff6de3eec6281ec047/node_modules/hosted-git-info/", {"name":"hosted-git-info","reference":"2.7.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-validate-npm-package-license-3.0.4-fc91f6b9c7ba15c857f4cb2c5defeec39d4f410a/node_modules/validate-npm-package-license/", {"name":"validate-npm-package-license","reference":"3.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-spdx-correct-3.1.0-fb83e504445268f154b074e218c87c003cd31df4/node_modules/spdx-correct/", {"name":"spdx-correct","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-spdx-expression-parse-3.0.0-99e119b7a5da00e05491c9fa338b7904823b41d0/node_modules/spdx-expression-parse/", {"name":"spdx-expression-parse","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-spdx-exceptions-2.2.0-2ea450aee74f2a89bfb94519c07fcd6f41322977/node_modules/spdx-exceptions/", {"name":"spdx-exceptions","reference":"2.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-spdx-license-ids-3.0.4-75ecd1a88de8c184ef015eafb51b5b48bfd11bb1/node_modules/spdx-license-ids/", {"name":"spdx-license-ids","reference":"3.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-type-2.0.0-f012ccb8415b7096fc2daa1054c3d72389594c73/node_modules/path-type/", {"name":"path-type","reference":"2.0.0"}],
  ["./.pnp/unplugged/npm-nodemon-1.19.1-576f0aad0f863aabf8c48517f6192ff987cd5071/node_modules/nodemon/", {"name":"nodemon","reference":"1.19.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-chokidar-2.1.6-b6cad653a929e244ce8a834244164d241fa954c5/node_modules/chokidar/", {"name":"chokidar","reference":"2.1.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-anymatch-2.0.0-bcb24b4f37934d9aa7ac17b4adaf89e7c76ef2eb/node_modules/anymatch/", {"name":"anymatch","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-micromatch-3.1.10-70859bc95c9840952f359a068a3fc49f9ecfac23/node_modules/micromatch/", {"name":"micromatch","reference":"3.1.10"}],
  ["../../../Library/Caches/Yarn/v4/npm-arr-diff-4.0.0-d6461074febfec71e7e15235761a329a5dc7c520/node_modules/arr-diff/", {"name":"arr-diff","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-array-unique-0.3.2-a894b75d4bc4f6cd679ef3244a9fd8f46ae2d428/node_modules/array-unique/", {"name":"array-unique","reference":"0.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-braces-2.3.2-5979fd3f14cd531565e5fa2df1abfff1dfaee729/node_modules/braces/", {"name":"braces","reference":"2.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-arr-flatten-1.1.0-36048bbff4e7b47e136644316c99669ea5ae91f1/node_modules/arr-flatten/", {"name":"arr-flatten","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-extend-shallow-2.0.1-51af7d614ad9a9f610ea1bafbb989d6b1c56890f/node_modules/extend-shallow/", {"name":"extend-shallow","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-extend-shallow-3.0.2-26a71aaf073b39fb2127172746131c2704028db8/node_modules/extend-shallow/", {"name":"extend-shallow","reference":"3.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-extendable-0.1.1-62b110e289a471418e3ec36a617d472e301dfc89/node_modules/is-extendable/", {"name":"is-extendable","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-extendable-1.0.1-a7470f9e426733d81bd81e1155264e3a3507cab4/node_modules/is-extendable/", {"name":"is-extendable","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-fill-range-4.0.0-d544811d428f98eb06a63dc402d2403c328c38f7/node_modules/fill-range/", {"name":"fill-range","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-number-3.0.0-24fd6201a4782cf50561c810276afc7d12d71195/node_modules/is-number/", {"name":"is-number","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-kind-of-3.2.2-31ea21a734bab9bbb0f32466d893aea51e4a3c64/node_modules/kind-of/", {"name":"kind-of","reference":"3.2.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-kind-of-4.0.0-20813df3d712928b207378691a45066fae72dd57/node_modules/kind-of/", {"name":"kind-of","reference":"4.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-kind-of-5.1.0-729c91e2d857b7a419a1f9aa65685c4c33f5845d/node_modules/kind-of/", {"name":"kind-of","reference":"5.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-kind-of-6.0.2-01146b36a6218e64e58f3a8d66de5d7fc6f6d051/node_modules/kind-of/", {"name":"kind-of","reference":"6.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-buffer-1.1.6-efaa2ea9daa0d7ab2ea13a97b2b8ad51fefbe8be/node_modules/is-buffer/", {"name":"is-buffer","reference":"1.1.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-repeat-string-1.6.1-8dcae470e1c88abc2d600fff4a776286da75e637/node_modules/repeat-string/", {"name":"repeat-string","reference":"1.6.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-to-regex-range-2.1.1-7c80c17b9dfebe599e27367e0d4dd5590141db38/node_modules/to-regex-range/", {"name":"to-regex-range","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-isobject-3.0.1-4e431e92b11a9731636aa1f9c8d1ccbcfdab78df/node_modules/isobject/", {"name":"isobject","reference":"3.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-isobject-2.1.0-f065561096a3f1da2ef46272f815c840d87e0c89/node_modules/isobject/", {"name":"isobject","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-repeat-element-1.1.3-782e0d825c0c5a3bb39731f84efee6b742e6b1ce/node_modules/repeat-element/", {"name":"repeat-element","reference":"1.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-snapdragon-0.8.2-64922e7c565b0e14204ba1aa7d6964278d25182d/node_modules/snapdragon/", {"name":"snapdragon","reference":"0.8.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-base-0.11.2-7bde5ced145b6d551a90db87f83c558b4eb48a8f/node_modules/base/", {"name":"base","reference":"0.11.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-cache-base-1.0.1-0a7f46416831c8b662ee36fe4e7c59d76f666ab2/node_modules/cache-base/", {"name":"cache-base","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-collection-visit-1.0.0-4bc0373c164bc3291b4d368c829cf1a80a59dca0/node_modules/collection-visit/", {"name":"collection-visit","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-map-visit-1.0.0-ecdca8f13144e660f1b5bd41f12f3479d98dfb8f/node_modules/map-visit/", {"name":"map-visit","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-visit-1.0.1-f79c4493af0c5377b59fe39d395e41042dd045bb/node_modules/object-visit/", {"name":"object-visit","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-component-emitter-1.3.0-16e4070fba8ae29b679f2215853ee181ab2eabc0/node_modules/component-emitter/", {"name":"component-emitter","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-get-value-2.0.6-dc15ca1c672387ca76bd37ac0a395ba2042a2c28/node_modules/get-value/", {"name":"get-value","reference":"2.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-value-1.0.0-18b281da585b1c5c51def24c930ed29a0be6b177/node_modules/has-value/", {"name":"has-value","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-value-0.3.1-7b1f58bada62ca827ec0a2078025654845995e1f/node_modules/has-value/", {"name":"has-value","reference":"0.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-values-1.0.0-95b0b63fec2146619a6fe57fe75628d5a39efe4f/node_modules/has-values/", {"name":"has-values","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-values-0.1.4-6d61de95d91dfca9b9a02089ad384bff8f62b771/node_modules/has-values/", {"name":"has-values","reference":"0.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-set-value-2.0.0-71ae4a88f0feefbbf52d1ea604f3fb315ebb6274/node_modules/set-value/", {"name":"set-value","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-set-value-0.4.3-7db08f9d3d22dc7f78e53af3c3bf4666ecdfccf1/node_modules/set-value/", {"name":"set-value","reference":"0.4.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-plain-object-2.0.4-2c163b3fafb1b606d9d17928f05c2a1c38e07677/node_modules/is-plain-object/", {"name":"is-plain-object","reference":"2.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-split-string-3.1.0-7cb09dda3a86585705c64b39a6466038682e8fe2/node_modules/split-string/", {"name":"split-string","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-assign-symbols-1.0.0-59667f41fadd4f20ccbc2bb96b8d4f7f78ec0367/node_modules/assign-symbols/", {"name":"assign-symbols","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-to-object-path-0.3.0-297588b7b0e7e0ac08e04e672f85c1f4999e17af/node_modules/to-object-path/", {"name":"to-object-path","reference":"0.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-union-value-1.0.0-5c71c34cb5bad5dcebe3ea0cd08207ba5aa1aea4/node_modules/union-value/", {"name":"union-value","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-arr-union-3.1.0-e39b09aea9def866a8f206e288af63919bae39c4/node_modules/arr-union/", {"name":"arr-union","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-unset-value-1.0.0-8376873f7d2335179ffb1e6fc3a8ed0dfc8ab559/node_modules/unset-value/", {"name":"unset-value","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-class-utils-0.3.6-f93369ae8b9a7ce02fd41faad0ca83033190c463/node_modules/class-utils/", {"name":"class-utils","reference":"0.3.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-define-property-0.2.5-c35b1ef918ec3c990f9a5bc57be04aacec5c8116/node_modules/define-property/", {"name":"define-property","reference":"0.2.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-define-property-1.0.0-769ebaaf3f4a63aad3af9e8d304c9bbe79bfb0e6/node_modules/define-property/", {"name":"define-property","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-define-property-2.0.2-d459689e8d654ba77e02a817f8710d702cb16e9d/node_modules/define-property/", {"name":"define-property","reference":"2.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-descriptor-0.1.6-366d8240dde487ca51823b1ab9f07a10a78251ca/node_modules/is-descriptor/", {"name":"is-descriptor","reference":"0.1.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-descriptor-1.0.2-3b159746a66604b04f8c81524ba365c5f14d86ec/node_modules/is-descriptor/", {"name":"is-descriptor","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-0.1.6-a9e12cb3ae8d876727eeef3843f8a0897b5c98d6/node_modules/is-accessor-descriptor/", {"name":"is-accessor-descriptor","reference":"0.1.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-accessor-descriptor-1.0.0-169c2f6d3df1f992618072365c9b0ea1f6878656/node_modules/is-accessor-descriptor/", {"name":"is-accessor-descriptor","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-data-descriptor-0.1.4-0b5ee648388e2c860282e793f1856fec3f301b56/node_modules/is-data-descriptor/", {"name":"is-data-descriptor","reference":"0.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-data-descriptor-1.0.0-d84876321d0e7add03990406abbbbd36ba9268c7/node_modules/is-data-descriptor/", {"name":"is-data-descriptor","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-static-extend-0.1.2-60809c39cbff55337226fd5e0b520f341f1fb5c6/node_modules/static-extend/", {"name":"static-extend","reference":"0.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-copy-0.1.0-7e7d858b781bd7c991a41ba975ed3812754e998c/node_modules/object-copy/", {"name":"object-copy","reference":"0.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-copy-descriptor-0.1.1-676f6eb3c39997c2ee1ac3a924fd6124748f578d/node_modules/copy-descriptor/", {"name":"copy-descriptor","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-mixin-deep-1.3.1-a49e7268dce1a0d9698e45326c5626df3543d0fe/node_modules/mixin-deep/", {"name":"mixin-deep","reference":"1.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-for-in-1.0.2-81068d295a8142ec0ac726c6e2200c30fb6d5e80/node_modules/for-in/", {"name":"for-in","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-pascalcase-0.1.1-b363e55e8006ca6fe21784d2db22bd15d7917f14/node_modules/pascalcase/", {"name":"pascalcase","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-map-cache-0.2.2-c32abd0bd6525d9b051645bb4f26ac5dc98a0dbf/node_modules/map-cache/", {"name":"map-cache","reference":"0.2.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-source-map-0.5.7-8a039d2d1021d22d1ea14c80d8ea468ba2ef3fcc/node_modules/source-map/", {"name":"source-map","reference":"0.5.7"}],
  ["../../../Library/Caches/Yarn/v4/npm-source-map-resolve-0.5.2-72e2cc34095543e43b2c62b2c4c10d4a9054f259/node_modules/source-map-resolve/", {"name":"source-map-resolve","reference":"0.5.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-atob-2.1.2-6d9517eb9e030d2436666651e86bd9f6f13533c9/node_modules/atob/", {"name":"atob","reference":"2.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-decode-uri-component-0.2.0-eb3913333458775cb84cd1a1fae062106bb87545/node_modules/decode-uri-component/", {"name":"decode-uri-component","reference":"0.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-resolve-url-0.2.1-2c637fe77c893afd2a663fe21aa9080068e2052a/node_modules/resolve-url/", {"name":"resolve-url","reference":"0.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-source-map-url-0.4.0-3e935d7ddd73631b97659956d55128e87b5084a3/node_modules/source-map-url/", {"name":"source-map-url","reference":"0.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-urix-0.1.0-da937f7a62e21fec1fd18d49b35c2935067a6c72/node_modules/urix/", {"name":"urix","reference":"0.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-use-3.1.1-d50c8cac79a19fbc20f2911f56eb973f4e10070f/node_modules/use/", {"name":"use","reference":"3.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-snapdragon-node-2.1.1-6c175f86ff14bdb0724563e8f3c1b021a286853b/node_modules/snapdragon-node/", {"name":"snapdragon-node","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-snapdragon-util-3.0.1-f956479486f2acd79700693f6f7b805e45ab56e2/node_modules/snapdragon-util/", {"name":"snapdragon-util","reference":"3.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-to-regex-3.0.2-13cfdd9b336552f30b51f33a8ae1b42a7a7599ce/node_modules/to-regex/", {"name":"to-regex","reference":"3.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-regex-not-1.0.2-1f4ece27e00b0b65e0247a6810e6a85d83a5752c/node_modules/regex-not/", {"name":"regex-not","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-safe-regex-1.1.0-40a3669f3b077d1e943d44629e157dd48023bf2e/node_modules/safe-regex/", {"name":"safe-regex","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ret-0.1.15-b8a4825d5bdb1fc3f6f53c2bc33f81388681c7bc/node_modules/ret/", {"name":"ret","reference":"0.1.15"}],
  ["../../../Library/Caches/Yarn/v4/npm-extglob-2.0.4-ad00fe4dc612a9232e8718711dc5cb5ab0285543/node_modules/extglob/", {"name":"extglob","reference":"2.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-expand-brackets-2.1.4-b77735e315ce30f6b6eff0f83b04151a22449622/node_modules/expand-brackets/", {"name":"expand-brackets","reference":"2.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-posix-character-classes-0.1.1-01eac0fe3b5af71a2a6c02feabb8c1fef7e00eab/node_modules/posix-character-classes/", {"name":"posix-character-classes","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-fragment-cache-0.2.1-4290fad27f13e89be7f33799c6bc5a0abfff0d19/node_modules/fragment-cache/", {"name":"fragment-cache","reference":"0.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-nanomatch-1.2.13-b87a8aa4fc0de8fe6be88895b38983ff265bd119/node_modules/nanomatch/", {"name":"nanomatch","reference":"1.2.13"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-windows-1.0.2-d1850eb9791ecd18e6182ce12a30f396634bb19d/node_modules/is-windows/", {"name":"is-windows","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-pick-1.3.0-87a10ac4c1694bd2e1cbf53591a66141fb5dd747/node_modules/object.pick/", {"name":"object.pick","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-normalize-path-2.1.1-1ab28b556e198363a8c1a6f7e6fa20137fe6aed9/node_modules/normalize-path/", {"name":"normalize-path","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-normalize-path-3.0.0-0dcd69ff23a1c9b11fd0978316644a0388216a65/node_modules/normalize-path/", {"name":"normalize-path","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-remove-trailing-separator-1.1.0-c24bce2a283adad5bc3f58e0d48249b92379d8ef/node_modules/remove-trailing-separator/", {"name":"remove-trailing-separator","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-async-each-1.0.3-b727dbf87d7651602f06f4d4ac387f47d91b0cbf/node_modules/async-each/", {"name":"async-each","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-glob-parent-3.1.0-9e6af6299d8d3bd2bd40430832bd113df906c5ae/node_modules/glob-parent/", {"name":"glob-parent","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-glob-3.1.0-7ba5ae24217804ac70707b96922567486cc3e84a/node_modules/is-glob/", {"name":"is-glob","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc/node_modules/is-glob/", {"name":"is-glob","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2/node_modules/is-extglob/", {"name":"is-extglob","reference":"2.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-path-dirname-1.0.2-cc33d24d525e099a5388c0336c6e32b9160609e0/node_modules/path-dirname/", {"name":"path-dirname","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-binary-path-1.0.1-75f16642b480f187a711c814161fd3a4a7655898/node_modules/is-binary-path/", {"name":"is-binary-path","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-binary-extensions-1.13.1-598afe54755b2868a5330d2aff9d4ebb53209b65/node_modules/binary-extensions/", {"name":"binary-extensions","reference":"1.13.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-readdirp-2.2.1-0e87622a3325aa33e892285caf8b4e846529a525/node_modules/readdirp/", {"name":"readdirp","reference":"2.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-readable-stream-2.3.6-b11c27d88b8ff1fbe070643cf94b0c79ae1b0aaf/node_modules/readable-stream/", {"name":"readable-stream","reference":"2.3.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-core-util-is-1.0.2-b5fd54220aa2bc5ab57aab7140c940754503c1a7/node_modules/core-util-is/", {"name":"core-util-is","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-process-nextick-args-2.0.0-a37d732f4271b4ab1ad070d35508e8290788ffaa/node_modules/process-nextick-args/", {"name":"process-nextick-args","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-string-decoder-1.1.1-9cf1611ba62685d7030ae9e4ba34149c3af03fc8/node_modules/string_decoder/", {"name":"string_decoder","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/", {"name":"util-deprecate","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-upath-1.1.2-3db658600edaeeccbe6db5e684d67ee8c2acd068/node_modules/upath/", {"name":"upath","reference":"1.1.2"}],
  ["./.pnp/unplugged/npm-fsevents-1.2.9-3f5ed66583ccd6f400b5a00db6f7e861363e388f/node_modules/fsevents/", {"name":"fsevents","reference":"1.2.9"}],
  ["../../../Library/Caches/Yarn/v4/npm-nan-2.14.0-7818f722027b2459a86f0295d434d1fc2336c52c/node_modules/nan/", {"name":"nan","reference":"2.14.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-node-pre-gyp-0.12.0-39ba4bb1439da030295f899e3b520b7785766149/node_modules/node-pre-gyp/", {"name":"node-pre-gyp","reference":"0.12.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-detect-libc-1.0.3-fa137c4bd698edf55cd5cd02ac559f91a4c4ba9b/node_modules/detect-libc/", {"name":"detect-libc","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-needle-2.4.0-6833e74975c444642590e15a750288c5f939b57c/node_modules/needle/", {"name":"needle","reference":"2.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/", {"name":"sax","reference":"1.2.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-nopt-4.0.1-d0d4685afd5415193c8c7505602d0d17cd64474d/node_modules/nopt/", {"name":"nopt","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-nopt-1.0.10-6ddd21bd2a31417b92727dd585f8a6f37608ebee/node_modules/nopt/", {"name":"nopt","reference":"1.0.10"}],
  ["../../../Library/Caches/Yarn/v4/npm-abbrev-1.1.1-f8f2c887ad10bf67f634f005b6987fed3179aac8/node_modules/abbrev/", {"name":"abbrev","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-osenv-0.1.5-85cdfafaeb28e8677f416e287592b5f3f49ea410/node_modules/osenv/", {"name":"osenv","reference":"0.1.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-os-homedir-1.0.2-ffbc4988336e0e833de0c168c7ef152121aa7fb3/node_modules/os-homedir/", {"name":"os-homedir","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-npm-packlist-1.4.1-19064cdf988da80ea3cee45533879d90192bbfbc/node_modules/npm-packlist/", {"name":"npm-packlist","reference":"1.4.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ignore-walk-3.0.1-a83e62e7d272ac0e3b551aaa82831a19b69f82f8/node_modules/ignore-walk/", {"name":"ignore-walk","reference":"3.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-npm-bundled-1.0.6-e7ba9aadcef962bb61248f91721cd932b3fe6bdd/node_modules/npm-bundled/", {"name":"npm-bundled","reference":"1.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-npmlog-4.1.2-08a7f2a8bf734604779a9efa4ad5cc717abb954b/node_modules/npmlog/", {"name":"npmlog","reference":"4.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-are-we-there-yet-1.1.5-4b35c2944f062a8bfcda66410760350fe9ddfc21/node_modules/are-we-there-yet/", {"name":"are-we-there-yet","reference":"1.1.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-delegates-1.0.0-84c6e159b81904fdca59a0ef44cd870d31250f9a/node_modules/delegates/", {"name":"delegates","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-console-control-strings-1.1.0-3d7cf4464db6446ea644bf4b39507f9851008e8e/node_modules/console-control-strings/", {"name":"console-control-strings","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-gauge-2.7.4-2c03405c7538c39d7eb37b317022e325fb018bf7/node_modules/gauge/", {"name":"gauge","reference":"2.7.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-aproba-1.2.0-6802e6264efd18c790a1b0d517f0f2627bf2c94a/node_modules/aproba/", {"name":"aproba","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-unicode-2.0.1-e0e6fe6a28cf51138855e086d1691e771de2a8b9/node_modules/has-unicode/", {"name":"has-unicode","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-object-assign-4.1.1-2109adc7965887cfc05cbbd442cac8bfbb360863/node_modules/object-assign/", {"name":"object-assign","reference":"4.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-code-point-at-1.1.0-0d070b4d043a5bea33a2f1a40e2edb3d9a4ccf77/node_modules/code-point-at/", {"name":"code-point-at","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-number-is-nan-1.0.1-097b602b53422a522c1afb8790318336941a011d/node_modules/number-is-nan/", {"name":"number-is-nan","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-wide-align-1.1.3-ae074e6bdc0c14a431e804e624549c633b000457/node_modules/wide-align/", {"name":"wide-align","reference":"1.1.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-set-blocking-2.0.0-045f9782d011ae9a6803ddd382b24392b3d890f7/node_modules/set-blocking/", {"name":"set-blocking","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-rc-1.2.8-cd924bf5200a075b83c188cd6b9e211b7fc0d3ed/node_modules/rc/", {"name":"rc","reference":"1.2.8"}],
  ["../../../Library/Caches/Yarn/v4/npm-deep-extend-0.6.0-c4fa7c95404a17a9c3e8ca7e1537312b736330ac/node_modules/deep-extend/", {"name":"deep-extend","reference":"0.6.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ini-1.3.5-eee25f56db1c9ec6085e0c22778083f596abf927/node_modules/ini/", {"name":"ini","reference":"1.3.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-tar-4.4.10-946b2810b9a5e0b26140cf78bea6b0b0d689eba1/node_modules/tar/", {"name":"tar","reference":"4.4.10"}],
  ["../../../Library/Caches/Yarn/v4/npm-chownr-1.1.1-54726b8b8fff4df053c42187e801fb4412df1494/node_modules/chownr/", {"name":"chownr","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-fs-minipass-1.2.6-2c5cc30ded81282bfe8a0d7c7c1853ddeb102c07/node_modules/fs-minipass/", {"name":"fs-minipass","reference":"1.2.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-minipass-2.3.5-cacebe492022497f656b0f0f51e2682a9ed2d848/node_modules/minipass/", {"name":"minipass","reference":"2.3.5"}],
  ["../../../Library/Caches/Yarn/v4/npm-minizlib-1.2.1-dd27ea6136243c7c880684e8672bb3a45fd9b614/node_modules/minizlib/", {"name":"minizlib","reference":"1.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ignore-by-default-1.0.1-48ca6d72f6c6a3af00a9ad4ae6876be3889e2b09/node_modules/ignore-by-default/", {"name":"ignore-by-default","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-pstree-remy-1.1.7-c76963a28047ed61542dc361aa26ee55a7fa15f3/node_modules/pstree.remy/", {"name":"pstree.remy","reference":"1.1.7"}],
  ["../../../Library/Caches/Yarn/v4/npm-touch-3.1.0-fe365f5f75ec9ed4e56825e0bb76d24ab74af83b/node_modules/touch/", {"name":"touch","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-undefsafe-2.0.2-225f6b9e0337663e0d8e7cfd686fc2836ccace76/node_modules/undefsafe/", {"name":"undefsafe","reference":"2.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-update-notifier-2.5.0-d0744593e13f161e406acb1d9408b72cad08aff6/node_modules/update-notifier/", {"name":"update-notifier","reference":"2.5.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-boxen-1.3.0-55c6c39a8ba58d9c61ad22cd877532deb665a20b/node_modules/boxen/", {"name":"boxen","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ansi-align-2.0.0-c36aeccba563b89ceb556f3690f0b1d9e3547f7f/node_modules/ansi-align/", {"name":"ansi-align","reference":"2.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-camelcase-4.1.0-d545635be1e33c542649c69173e5de6acfae34dd/node_modules/camelcase/", {"name":"camelcase","reference":"4.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-cli-boxes-1.0.0-4fa917c3e59c94a004cd61f8ee509da651687143/node_modules/cli-boxes/", {"name":"cli-boxes","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-term-size-1.2.0-458b83887f288fc56d6fffbfad262e26638efa69/node_modules/term-size/", {"name":"term-size","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-widest-line-2.0.1-7438764730ec7ef4381ce4df82fb98a53142a3fc/node_modules/widest-line/", {"name":"widest-line","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-configstore-3.1.2-c6f25defaeef26df12dd33414b001fe81a543f8f/node_modules/configstore/", {"name":"configstore","reference":"3.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-dot-prop-4.2.0-1f19e0c2e1aa0e32797c49799f2837ac6af69c57/node_modules/dot-prop/", {"name":"dot-prop","reference":"4.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-obj-1.0.1-3e4729ac1f5fde025cd7d83a896dab9f4f67db0f/node_modules/is-obj/", {"name":"is-obj","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-make-dir-1.3.0-79c1033b80515bd6d24ec9933e860ca75ee27f0c/node_modules/make-dir/", {"name":"make-dir","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-unique-string-1.0.0-9e1057cca851abb93398f8b33ae187b99caec11a/node_modules/unique-string/", {"name":"unique-string","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-crypto-random-string-1.0.0-a230f64f568310e1498009940790ec99545bca7e/node_modules/crypto-random-string/", {"name":"crypto-random-string","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-write-file-atomic-2.4.3-1fd2e9ae1df3e75b8d8c367443c692d4ca81f481/node_modules/write-file-atomic/", {"name":"write-file-atomic","reference":"2.4.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-xdg-basedir-3.0.0-496b2cc109eca8dbacfe2dc72b603c17c5870ad4/node_modules/xdg-basedir/", {"name":"xdg-basedir","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-import-lazy-2.1.0-05698e3d45c88e8d7e9d92cb0584e77f096f3e43/node_modules/import-lazy/", {"name":"import-lazy","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-ci-1.2.1-e3779c8ee17fccf428488f6e281187f2e632841c/node_modules/is-ci/", {"name":"is-ci","reference":"1.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ci-info-1.6.0-2ca20dbb9ceb32d4524a683303313f0304b1e497/node_modules/ci-info/", {"name":"ci-info","reference":"1.6.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-installed-globally-0.1.0-0dfd98f5a9111716dd535dda6492f67bf3d25a80/node_modules/is-installed-globally/", {"name":"is-installed-globally","reference":"0.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-global-dirs-0.1.1-b319c0dd4607f353f3be9cca4c72fc148c49f445/node_modules/global-dirs/", {"name":"global-dirs","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-path-inside-1.0.1-8ef5b7de50437a3fdca6b4e865ef7aa55cb48036/node_modules/is-path-inside/", {"name":"is-path-inside","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-npm-1.0.0-f2fb63a65e4905b406c86072765a1a4dc793b9f4/node_modules/is-npm/", {"name":"is-npm","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-latest-version-3.1.0-a205383fea322b33b5ae3b18abee0dc2f356ee15/node_modules/latest-version/", {"name":"latest-version","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-package-json-4.0.1-8869a0401253661c4c4ca3da6c2121ed555f5eed/node_modules/package-json/", {"name":"package-json","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-got-6.7.1-240cd05785a9a18e561dc1b44b41c763ef1e8db0/node_modules/got/", {"name":"got","reference":"6.7.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-create-error-class-3.0.2-06be7abef947a3f14a30fd610671d401bca8b7b6/node_modules/create-error-class/", {"name":"create-error-class","reference":"3.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-capture-stack-trace-1.0.1-a6c0bbe1f38f3aa0b92238ecb6ff42c344d4135d/node_modules/capture-stack-trace/", {"name":"capture-stack-trace","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-duplexer3-0.1.4-ee01dd1cac0ed3cbc7fdbea37dc0a8f1ce002ce2/node_modules/duplexer3/", {"name":"duplexer3","reference":"0.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-redirect-1.0.0-1d03dded53bd8db0f30c26e4f95d36fc7c87dc24/node_modules/is-redirect/", {"name":"is-redirect","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-retry-allowed-1.1.0-11a060568b67339444033d0125a61a20d564fb34/node_modules/is-retry-allowed/", {"name":"is-retry-allowed","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-lowercase-keys-1.0.1-6f9e30b47084d971a7c820ff15a6c5167b74c26f/node_modules/lowercase-keys/", {"name":"lowercase-keys","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-timed-out-4.0.1-f32eacac5a175bea25d7fab565ab3ed8741ef56f/node_modules/timed-out/", {"name":"timed-out","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-unzip-response-2.0.1-d2f0f737d16b0615e72a6935ed04214572d56f97/node_modules/unzip-response/", {"name":"unzip-response","reference":"2.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-url-parse-lax-1.0.0-7af8f303645e9bd79a272e7a14ac68bc0609da73/node_modules/url-parse-lax/", {"name":"url-parse-lax","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-prepend-http-1.0.4-d4f4562b0ce3696e41ac52d0e002e57a635dc6dc/node_modules/prepend-http/", {"name":"prepend-http","reference":"1.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-registry-auth-token-3.4.0-d7446815433f5d5ed6431cd5dca21048f66b397e/node_modules/registry-auth-token/", {"name":"registry-auth-token","reference":"3.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-registry-url-3.1.0-3d4ef870f73dde1d77f0cf9a381432444e174942/node_modules/registry-url/", {"name":"registry-url","reference":"3.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-semver-diff-2.1.0-4bbb8437c8d37e4b0cf1a68fd726ec6d645d6d36/node_modules/semver-diff/", {"name":"semver-diff","reference":"2.1.0"}],
  ["./", topLevelLocator],
]);
exports.findPackageLocator = function findPackageLocator(location) {
  let relativeLocation = normalizePath(path.relative(__dirname, location));

  if (!relativeLocation.match(isStrictRegExp))
    relativeLocation = `./${relativeLocation}`;

  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
    relativeLocation = `${relativeLocation}/`;

  let match;

  if (relativeLocation.length >= 172 && relativeLocation[171] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 172)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 154 && relativeLocation[153] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 154)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 152 && relativeLocation[151] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 152)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 150 && relativeLocation[149] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 150)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 149 && relativeLocation[148] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 149)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 148 && relativeLocation[147] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 148)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 144 && relativeLocation[143] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 144)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 142 && relativeLocation[141] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 142)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 140 && relativeLocation[139] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 140)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 139 && relativeLocation[138] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 139)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 138 && relativeLocation[137] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 138)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 136 && relativeLocation[135] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 136)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 134 && relativeLocation[133] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 134)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 133 && relativeLocation[132] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 133)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 132 && relativeLocation[131] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 132)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 130 && relativeLocation[129] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 130)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 129 && relativeLocation[128] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 129)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 128 && relativeLocation[127] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 128)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 126 && relativeLocation[125] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 126)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 124)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 123 && relativeLocation[122] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 123)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 122 && relativeLocation[121] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 122)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 121)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 120)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 119)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 118)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 117 && relativeLocation[116] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 117)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 116 && relativeLocation[115] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 116)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 115)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 114 && relativeLocation[113] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 114)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 113)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 112 && relativeLocation[111] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 112)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 111)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 110 && relativeLocation[109] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 110)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 109 && relativeLocation[108] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 109)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 108 && relativeLocation[107] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 108)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 107 && relativeLocation[106] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 107)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 106 && relativeLocation[105] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 106)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 105 && relativeLocation[104] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 105)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 104 && relativeLocation[103] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 104)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 102 && relativeLocation[101] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 102)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 99 && relativeLocation[98] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 99)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 98 && relativeLocation[97] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 98)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 2)))
      return blacklistCheck(match);

  return null;
};


/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

        if (resolution !== null) {
          return resolution;
        }
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

function normalizePath(fsPath) {
  fsPath = path.normalize(fsPath);

  if (process.platform === 'win32') {
    fsPath = fsPath.replace(backwardSlashRegExp, '/');
  }

  return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
        {
          request,
          issuer,
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer,
          }
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName}
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName}
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName}
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates}
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)}
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {}
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath}
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {considerBuiltins});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer,
          }
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath, {extensions});
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    for (const [filter, patchFn] of patchedModules) {
      if (filter.test(request)) {
        module.exports = patchFn(exports.findPackageLocator(parent.filename), module.exports);
      }
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    let issuers;

    if (options) {
      const optionNames = new Set(Object.keys(options));
      optionNames.delete('paths');

      if (optionNames.size > 0) {
        throw makeError(
          `UNSUPPORTED`,
          `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
        );
      }

      if (options.paths) {
        issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
      }
    }

    if (!issuers) {
      const issuerModule = getIssuerModule(parent);
      const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

      issuers = [issuer];
    }

    let firstError;

    for (const issuer of issuers) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, issuer);
      } catch (error) {
        firstError = firstError || error;
        continue;
      }

      return resolution !== null ? resolution : request;
    }

    throw firstError;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // Modern versions of `resolve` support a specific entry point that custom resolvers can use
  // to inject a specific resolution logic without having to patch the whole package.
  //
  // Cf: https://github.com/browserify/resolve/pull/174

  patchedModules.push([
    /^\.\/normalize-options\.js$/,
    (issuer, normalizeOptions) => {
      if (!issuer || issuer.name !== 'resolve') {
        return normalizeOptions;
      }

      return (request, opts) => {
        opts = opts || {};

        if (opts.forceNodeResolution) {
          return opts;
        }

        opts.preserveSymlinks = true;
        opts.paths = function(request, basedir, getNodeModulesDir, opts) {
          // Extract the name of the package being requested (1=full name, 2=scope name, 3=local name)
          const parts = request.match(/^((?:(@[^\/]+)\/)?([^\/]+))/);

          // make sure that basedir ends with a slash
          if (basedir.charAt(basedir.length - 1) !== '/') {
            basedir = path.join(basedir, '/');
          }
          // This is guaranteed to return the path to the "package.json" file from the given package
          const manifestPath = exports.resolveToUnqualified(`${parts[1]}/package.json`, basedir);

          // The first dirname strips the package.json, the second strips the local named folder
          let nodeModules = path.dirname(path.dirname(manifestPath));

          // Strips the scope named folder if needed
          if (parts[2]) {
            nodeModules = path.dirname(nodeModules);
          }

          return [nodeModules];
        };

        return opts;
      };
    },
  ]);
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
