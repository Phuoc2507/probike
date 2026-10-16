// Lõi mô phỏng ProBike — điểm vào cho các phần khác (hiển thị 3D, trang mô phỏng, runtime).

export { RapierSimEngine, createSimEngine, initRapier, PHYSICS, PHYSICS_DT } from './engine';
export { analyzeVehicle, frameMass, DesignError } from './vehicle';
export type { VehicleModel, WheelModel, ReactionWheelModel, DriveMotorModel, ServoModel, SensorModel } from './vehicle';
export { buildMapGeometry, pointAt, projectOnPath, seesawQuat } from './maps/geometry';
export type {
  MapGeometry, PathSegment, BoxGeom, LineGeom, RockGeom, SeesawGeom, CheckpointGeom, PathProjection,
} from './maps/geometry';
export * from './maps/spec';
export { SCORING, computeScore } from './scoring';
export { NOISE_FACTOR, LATENCY_FACTOR, sharpVoltage, sharpDistance, sensorRay } from './sensors';
export { SAMPLE_DESIGN, SAMPLE_GAINS, SAMPLE_BALANCE_CODE, SampleBalanceController } from './sampleDesign';
export type { BalanceGains } from './sampleDesign';
