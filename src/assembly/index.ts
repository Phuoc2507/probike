// API công khai của phần Lắp ráp xe. Các phần khác chỉ import từ '@/assembly'.

// Giao diện
export { Assembler, type AssemblerProps } from './Assembler';
export { VehicleModel, type VehicleModelProps } from './VehicleModel';
export { PartModel, type PartModelProps } from './models/PartModel';
export { FrameModel } from './models/FrameModel';
export { SensorViz } from './models/SensorViz';

// Kiểm tra luật & thống kê
export { checkDesign, checkDesignDetailed, computeStats, designBounds, partOBB, fmtCm, fmtKg, fmtVnd } from './rules';

// Tạo/sửa thiết kế (hàm thuần, trả thiết kế mới)
export {
  LIMITS, FRAME_RANGE, GRID_STEP, ROTATE_STEP_DEG, WHEEL_ITEM_ID, WHEEL_RADIUS, FRAME_THICKNESS, FRAME_MATERIAL_LABEL,
  createEmptyDesign, makeFrame, setFrame, addPart, updatePart, movePart, removePart, getPart, findWheels,
  computeFrameMass, frameCost, frameBox, wheelPosition, validatePartName, uniqueName, controllerPins, needsPin,
  attachCandidates, SHARED_PINS,
} from './design';

// Xe mẫu
export { PRESETS, createDefaultDesign, type DesignPreset } from './presets';
