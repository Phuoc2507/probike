// Phần "Lập trình xe" — điểm vào duy nhất cho các phần khác (trang mô phỏng, cộng tác...).
//
// Chạy code:     createControllerRuntime() → ControllerRuntime (Worker trong trình duyệt, chạy tại chỗ trong Node)
// Khối:          <BlocklyEditor partNames value onChange />, blocksJsonToJs(json)
// Code:          <CodeEditor value onChange partNames error />
// Arduino:       blocksJsonToArduino(json, { design }), <ArduinoCodeView blocks design />
// Mẫu & bài học: samplePidJs(), samplePidBlocks(), pidTutorial()

// ----- Runtime
export { ControllerCore, BLOCKED_GLOBALS, findSyntaxErrorLine } from './runtime/core';
export type { ControllerCoreOptions, LoadResult } from './runtime/core';
export { LocalControllerRuntime } from './runtime/local-runtime';
export { WorkerControllerRuntime, createControllerRuntime } from './runtime/worker-runtime';
export type { WorkerRuntimeOptions, WorkerLike, RuntimeMode } from './runtime/worker-runtime';
export { ControllerError } from './runtime/errors';
export { PID, makePIDClass } from './runtime/pid';
export type { PIDLike, PIDInstance } from './runtime/pid';

// ----- Blockly
export { default as BlocklyEditor } from './blockly/BlocklyEditor';
export type { BlocklyEditorProps, BlocklyChangeInfo } from './blockly/BlocklyEditor';
export { setupBlockly, blocksJsonToJs, workspaceToJs, PROBIKE_BLOCK_TYPES, FieldPart } from './blockly/blocks';
export { setPartOptions, partOptionsFromDesign, partOptionsFromNames } from './blockly/parts';
export type { PartOptions, PartKind } from './blockly/parts';
export { TOOLBOX, SUPPORTED_STANDARD_BLOCKS } from './blockly/toolbox';

// ----- Code editor
export { default as CodeEditor } from './editor/CodeEditor';
export type { CodeEditorProps, CodeError } from './editor/CodeEditor';
export { probikeCompletionSource } from './editor/completions';

// ----- Arduino C++
export { blocksJsonToArduino, ArduinoGenerator } from './arduino/generator';
export type { ArduinoOptions } from './arduino/generator';
export type { ArduinoPart } from './arduino/sketch';
export { default as ArduinoCodeView } from './arduino/ArduinoCodeView';
export type { ArduinoCodeViewProps } from './arduino/ArduinoCodeView';

// ----- Mẫu, bài hướng dẫn, tài liệu API
export {
  samplePidJs, samplePidBlocks, emptyBlocks, EMPTY_JS, DEFAULT_GAINS, DEFAULT_FLYWHEEL_NAME,
} from './samples/samples';
export type { Gains } from './samples/samples';
export { pidTutorial } from './samples/tutorial';
export type { TutorialStep, TutorialSlider } from './samples/tutorial';
export { API_DOCS, IMU_METHODS, PID_METHODS } from './api-docs';
export type { ApiDoc } from './api-docs';
