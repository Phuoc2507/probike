// Lõi mô phỏng headless dùng Rapier. Bước vật lý cố định 1 ms; mỗi step(cmd) chạy đúng một chu kỳ
// điều khiển (1 / loopHz của vi điều khiển). Không import React/three để chạy được trong Worker và Vitest.

import RAPIER from '@dimforge/rapier3d-compat';
import type {
  ActuatorCommand, BodyPose, MapId, RunEndReason, RunResult, SensorFrame, SensorValue,
  SimConfig, SimEngine, SimSnapshot,
} from '@/shared/types';
import {
  DEG, Rng, add, cross, dot, eulerYZX, length, qAxisAngle, qFromEulerDeg, qHeading, qMul,
  qRotate, scale, sub, subSeed, toQuat, toVec3, v3,
} from './math';
import type { Q4, V3 } from './math';
import { buildMapGeometry, projectOnPath } from './maps/geometry';
import type { MapGeometry, PathProjection } from './maps/geometry';
import { BALANCE_FLAT, COURSE } from './maps/spec';
import { analyzeVehicle } from './vehicle';
import type { ReactionWheelModel, VehicleModel, WheelModel } from './vehicle';
import { SensorChannel } from './sensors';
import type { ImuReading, RayHit, SensorContext } from './sensors';
import { SCORING, computeScore } from './scoring';

export const PHYSICS_DT = 0.001;

/** Tham số vật lý chính (ghi trong báo cáo). */
export const PHYSICS = {
  gravity: 9.81,
  solverIterations: 8,
  /** Ma sát ổ bi bánh đà (N·m·s/rad). */
  flywheelBearing: 1e-6,
  /** Cản lăn của bánh xe (giảm chấn góc Rapier). */
  wheelAngularDamping: 0.02,
  /** Khối lượng & quán tính càng lái (khi có servo lái). */
  forkMass: 0.01,
  forkInertia: 2e-6,
  /** Servo: độ cứng (N·m/rad) và giảm chấn vị trí. */
  servoStiffness: 3,
  servoDamping: 0.03,
  /** Nâng xe khỏi nền lúc thả (m). */
  dropHeight: 0.0015,
  /** Góc nghiêng ban đầu ngẫu nhiên tối đa (độ) theo seed. */
  initialTiltDeg: 0.8,
  /** Nhiễu đẩy ngẫu nhiên khi disturbances bật. */
  push: { firstAfterS: 2, minIntervalS: 2, maxIntervalS: 4, minImpulse: 0.03, maxImpulse: 0.07 },
  /** Kiểm tra thân chạm đất mỗi n bước. */
  contactCheckEvery: 4,
} as const;

const PUSH_FACTOR = { low: 0.7, medium: 1, high: 1.3 } as const;

// Nhóm va chạm: map (bit 0) va với tất cả; xe (bit 1) chỉ va với map; tia đo chỉ trúng map.
const GROUP_MAP = (0x0001 << 16) | 0xffff;
const GROUP_BIKE = (0x0002 << 16) | 0x0001;
const GROUP_RAY = (0xffff << 16) | 0x0001;

type MapTag = 'floor' | 'wall' | 'rock' | 'seesaw';

let rapierReady: Promise<void> | null = null;
/** Khởi tạo WASM của Rapier đúng một lần. */
export function initRapier(): Promise<void> {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

interface WheelRt { model: WheelModel; body: RAPIER.RigidBody; parent: RAPIER.RigidBody }
interface DriveRt { name: string; uid: string; stall: number; w0: number; wheel: WheelRt; u: number }
interface ReactionRt {
  model: ReactionWheelModel; stall: number; w0: number; u: number;
  spinAbs: number;   // tốc độ tuyệt đối quanh trục a (rad/s, quy tắc tay phải)
  spinRel: number;   // tương đối so với thân
  angle: number;     // góc quay tương đối (để vẽ)
}

const toR = (a: V3) => ({ x: a.x, y: a.y, z: a.z });
const fromR = (a: { x: number; y: number; z: number }): V3 => v3(a.x, a.y, a.z);
const fromRQ = (q: { x: number; y: number; z: number; w: number }): Q4 => ({ x: q.x, y: q.y, z: q.z, w: q.w });

export class RapierSimEngine implements SimEngine {
  controlPeriod = 0.01;

  private cfg!: SimConfig;
  private world!: RAPIER.World;
  vehicle!: VehicleModel;
  map!: MapGeometry;

  private chassis!: RAPIER.RigidBody;
  private chassisColliders: RAPIER.Collider[] = [];
  private wheels: WheelRt[] = [];
  private drives: DriveRt[] = [];
  private reactions: ReactionRt[] = [];
  private steerJoint: RAPIER.RevoluteImpulseJoint | null = null;
  private steerTarget = 0;   // độ, lệnh
  private steerAngle = 0;    // độ, đã giới hạn tốc độ quay
  private seesawBody: RAPIER.RigidBody | null = null;
  private mapTags = new Map<number, MapTag>();
  private groundColliders: RAPIER.Collider[] = [];

  private channels: SensorChannel[] = [];
  private sensorCtx!: SensorContext;
  private sensorRng!: Rng;
  private pushRng!: Rng;
  private nextPushT = Infinity;

  private stepCount = 0;
  private controlCount = 0;
  private prevLinvel = v3();
  private prevAngvel = v3();
  private accCom = v3();
  private alpha = v3();

  private roll = 0;
  private maxRoll = 0;
  private streakStart = 0;
  private bestStreak = 0;
  private passed: string[] = [];
  private proj: PathProjection | null = null;
  private ended: RunResult | null = null;
  private disposed = false;

  get time(): number {
    return this.stepCount * PHYSICS_DT;
  }

  async init(config: SimConfig): Promise<void> {
    await initRapier();
    this.cfg = config;
    this.vehicle = analyzeVehicle(config.design);
    this.map = buildMapGeometry(config.mapId, config.seed);
    this.controlPeriod = 1 / this.vehicle.loopHz;

    const world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
    world.timestep = PHYSICS_DT;
    world.numSolverIterations = PHYSICS.solverIterations;
    this.world = world;

    this.buildMap();
    this.buildBike(new Rng(subSeed(config.seed, 7)));

    this.sensorRng = new Rng(subSeed(config.seed, 11));
    this.pushRng = new Rng(subSeed(config.seed, 13));
    if (config.disturbances) this.nextPushT = PHYSICS.push.firstAfterS + this.pushRng.range(0, 1);

    // một bước khởi động (không tính giờ) để Rapier dựng cấu trúc truy vấn tia cho lần đo đầu tiên
    this.world.step();
    this.prevLinvel = fromR(this.chassis.linvel());
    this.prevAngvel = fromR(this.chassis.angvel());
    this.sensorCtx = this.makeSensorContext();
    this.sensorCtx.position = fromR(this.chassis.translation());
    this.sensorCtx.rotation = fromRQ(this.chassis.rotation());
    this.channels = this.vehicle.sensors.map((s) => new SensorChannel(s, config.realism, this.sensorRng, this.sensorCtx));
    this.updateStatus(true);
  }

  // ------------------------------------------------------------------ dựng map

  private addFixedBox(b: { center: [number, number, number]; size: [number, number, number]; quaternion: [number, number, number, number] },
    tag: MapTag, friction: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)
      .setTranslation(b.center[0], b.center[1], b.center[2])
      .setRotation({ x: b.quaternion[0], y: b.quaternion[1], z: b.quaternion[2], w: b.quaternion[3] })
      .setFriction(friction)
      .setCollisionGroups(GROUP_MAP);
    const c = this.world.createCollider(desc);
    this.mapTags.set(c.handle, tag);
    if (tag !== 'wall') this.groundColliders.push(c);
    return c;
  }

  private buildMap(): void {
    const m = this.map;
    this.addFixedBox(m.floor, 'floor', COURSE.floorFriction);
    for (const w of m.walls) this.addFixedBox(w, 'wall', COURSE.wallFriction);
    for (const r of m.rocks) {
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(r.points));
      if (!desc) continue;
      desc.setTranslation(r.position[0], r.position[1], r.position[2])
        .setRotation({ x: r.quaternion[0], y: r.quaternion[1], z: r.quaternion[2], w: r.quaternion[3] })
        .setFriction(COURSE.floorFriction)
        .setCollisionGroups(GROUP_MAP);
      const c = this.world.createCollider(desc);
      this.mapTags.set(c.handle, 'rock');
      this.groundColliders.push(c);
    }
    if (m.seesaw) {
      const s = m.seesaw;
      const axis = v3(...s.axis);
      const q0 = qHeading(s.heading);
      const qInit = qMul(qAxisAngle(axis, s.initialTiltDeg * DEG), q0);
      const anchor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.pivot[0], s.pivot[1], s.pivot[2]).setRotation(q0));
      const I = (s.massKg * (s.length ** 2 + s.thickness ** 2)) / 12;
      const plank = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(s.pivot[0], s.pivot[1], s.pivot[2])
          .setRotation(qInit)
          .setAngularDamping(s.angularDamping)
          .setCanSleep(false)
          // trọng tâm ván cao hơn trục 3 mm (trục nằm dưới ván như cầu thật) → ván luôn tì một đầu xuống nền
          .setAdditionalMassProperties(s.massKg, { x: 0, y: 0.003, z: 0 },
            { x: (s.massKg * (s.width ** 2 + s.thickness ** 2)) / 12, y: I + (s.massKg * s.width ** 2) / 12, z: I },
            { x: 0, y: 0, z: 0, w: 1 }),
      );
      const c = this.world.createCollider(
        (RAPIER.ColliderDesc.convexHull(new Float32Array(s.points)) ??
          RAPIER.ColliderDesc.cuboid(s.length / 2, s.thickness / 2, s.width / 2).setTranslation(0, -s.thickness / 2, 0))
          .setDensity(0)
          .setFriction(COURSE.floorFriction)
          .setCollisionGroups(GROUP_MAP),
        plank,
      );
      this.mapTags.set(c.handle, 'seesaw');
      this.groundColliders.push(c);
      // khớp quay quanh z cục bộ: anchor cũng quay theo hướng cầu nên trục z của hai bên trùng nhau (= f × ŷ)
      const joint = this.world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), anchor, plank, true,
      ) as RAPIER.RevoluteImpulseJoint;
      const lim = s.maxTiltDeg * DEG;
      joint.setLimits(-lim, lim);
      this.seesawBody = plank;
    }
  }

  // ------------------------------------------------------------------ dựng xe

  private buildBike(rng: Rng): void {
    const vm = this.vehicle;
    const start = this.map.start;
    const tilt = rng.range(-1, 1) * PHYSICS.initialTiltDeg * (this.cfg.realism === 'low' ? 0.5 : 1);
    const q = qMul(qHeading(start.heading), qAxisAngle(v3(1, 0, 0), tilt * DEG));
    const lift = Math.max(...vm.wheels.map((w) => w.radius - w.center.y)) + PHYSICS.dropHeight;
    const origin = v3(start.position[0], start.position[1] + lift, start.position[2]);
    const toWorld = (p: V3) => add(origin, qRotate(q, p));

    const c = vm.chassis;
    this.chassis = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setRotation(q)
        .setCanSleep(false)
        .setAdditionalMassProperties(c.mass, toR(c.com), toR(c.principalInertia), c.inertiaFrame),
    );
    for (const b of c.boxes) {
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(Math.max(b.half.x, 0.001), Math.max(b.half.y, 0.001), Math.max(b.half.z, 0.001))
          .setTranslation(b.center.x, b.center.y, b.center.z)
          .setRotation(b.rotation)
          .setDensity(0)
          .setFriction(0.5)
          .setCollisionGroups(GROUP_BIKE),
        this.chassis,
      );
      this.chassisColliders.push(col);
    }

    for (const w of vm.wheels) {
      const wp = toWorld(w.center);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(wp.x, wp.y, wp.z)
          .setRotation(q)
          .setCanSleep(false)
          .setAngularDamping(PHYSICS.wheelAngularDamping)
          .setAdditionalMassProperties(w.mass, { x: 0, y: 0, z: 0 },
            { x: w.spinInertia * 0.55, y: w.spinInertia * 0.55, z: w.spinInertia }, { x: 0, y: 0, z: 0, w: 1 }),
      );
      // lốp tròn: trụ bo tròn, bán kính bo = nửa bề rộng (mặt lốp cong như lốp thật)
      const border = w.width / 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.roundCylinder(0.0005, Math.max(0.002, w.radius - border), border)
          .setRotation(qAxisAngle(v3(1, 0, 0), Math.PI / 2))
          .setDensity(0)
          .setFriction(w.friction)
          .setCollisionGroups(GROUP_BIKE),
        body,
      );
      let parent = this.chassis;
      if (w.front && vm.steering) {
        const fork = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(wp.x, wp.y, wp.z)
            .setRotation(q)
            .setCanSleep(false)
            .setAdditionalMassProperties(PHYSICS.forkMass, { x: 0, y: 0, z: 0 },
              { x: PHYSICS.forkInertia, y: PHYSICS.forkInertia, z: PHYSICS.forkInertia }, { x: 0, y: 0, z: 0, w: 1 }),
        );
        const sj = this.world.createImpulseJoint(
          RAPIER.JointData.revolute(toR(w.center), { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
          this.chassis, fork, true,
        ) as RAPIER.RevoluteImpulseJoint;
        const lim = vm.steering.maxSteerDeg * DEG;
        sj.setLimits(-lim, lim);
        sj.configureMotorModel(RAPIER.MotorModel.ForceBased);
        sj.setMotorMaxForce(vm.steering.spec.stallTorqueNm);
        sj.configureMotorPosition(0, PHYSICS.servoStiffness, PHYSICS.servoDamping);
        this.steerJoint = sj;
        parent = fork;
        this.world.createImpulseJoint(
          RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), fork, body, true);
      } else {
        this.world.createImpulseJoint(
          RAPIER.JointData.revolute(toR(w.center), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), this.chassis, body, true);
      }
      this.wheels.push({ model: w, body, parent });
    }

    for (const d of vm.drives) {
      const wheel = this.wheels.find((w) => w.model.uid === d.wheelUid)!;
      this.drives.push({ name: d.name, uid: d.uid, stall: d.spec.stallTorqueNm, w0: (d.spec.noLoadRpm * 2 * Math.PI) / 60, wheel, u: 0 });
    }
    for (const r of vm.reactions) {
      this.reactions.push({ model: r, stall: r.spec.stallTorqueNm, w0: (r.spec.noLoadRpm * 2 * Math.PI) / 60, u: 0, spinAbs: 0, spinRel: 0, angle: 0 });
    }
  }

  // ------------------------------------------------------------------ cảm biến

  private makeSensorContext(): SensorContext {
    const self = this;
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    return {
      t: 0,
      position: v3(),
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      angvel: v3(),
      accelAt(local: V3): V3 {
        const rot = fromRQ(self.chassis.rotation());
        const r = qRotate(rot, sub(local, self.vehicle.chassis.com));
        const w = fromR(self.chassis.angvel());
        return add(add(self.accCom, cross(self.alpha, r)), cross(w, cross(w, r)));
      },
      castRay(origin: V3, dir: V3, maxDist: number): RayHit | null {
        ray.origin = toR(origin);
        ray.dir = toR(dir);
        const hit = self.world.castRayAndGetNormal(ray, maxDist, true, undefined, GROUP_RAY);
        if (!hit) return null;
        const tag = self.mapTags.get(hit.collider.handle);
        const p = add(origin, scale(dir, hit.timeOfImpact));
        return { dist: hit.timeOfImpact, normal: fromR(hit.normal), white: tag === 'wall' || (tag === 'floor' && self.onPaintedLine(p)) };
      },
      shaftRps(target): number {
        if (target.type === 'reaction') {
          const r = self.reactions.find((x) => x.model.uid === target.uid);
          return r ? -r.spinRel / (2 * Math.PI) : 0;
        }
        const wheel = target.type === 'drive'
          ? self.drives.find((d) => d.uid === target.uid)?.wheel
          : self.wheels.find((w) => w.model.uid === target.uid);
        return wheel ? self.wheelForwardSpin(wheel) / (2 * Math.PI) : 0;
      },
    };
  }

  private onPaintedLine(p: V3): boolean {
    for (const l of this.map.lines) {
      const q = { x: l.quaternion[0], y: l.quaternion[1], z: l.quaternion[2], w: l.quaternion[3] };
      const local = qRotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, sub(p, v3(...l.center)));
      if (Math.abs(local.x) <= l.size[0] / 2 && Math.abs(local.z) <= l.size[2] / 2) return true;
    }
    return false;
  }

  /** Tốc độ quay tương đối của bánh (rad/s), dương = lăn về phía trước. */
  private wheelForwardSpin(w: WheelRt): number {
    const a = qRotate(fromRQ(w.body.rotation()), v3(0, 0, 1));
    const rel = sub(fromR(w.body.angvel()), fromR(w.parent.angvel()));
    return -dot(rel, a);
  }

  // ------------------------------------------------------------------ chạy

  step(cmd: ActuatorCommand): void {
    if (this.disposed) return;
    this.applyCommand(this.ended ? {} : cmd, !!this.ended);
    this.controlCount++;
    const target = Math.round((this.controlCount * this.controlPeriod) / PHYSICS_DT);
    while (this.stepCount < target) this.physicsStep();
  }

  private applyCommand(cmd: ActuatorCommand, stopAll: boolean): void {
    if (stopAll) {
      for (const d of this.drives) d.u = 0;
      for (const r of this.reactions) r.u = 0;
      return;
    }
    const val = (k: string, lo: number, hi: number): number | undefined => {
      const x = cmd[k];
      if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
      return Math.max(lo, Math.min(hi, x));
    };
    // lệnh giữ nguyên tới khi có lệnh mới (giống analogWrite trên Arduino)
    for (const d of this.drives) d.u = val(d.name, -1, 1) ?? d.u;
    for (const r of this.reactions) r.u = val(r.model.name, -1, 1) ?? r.u;
    const st = this.vehicle.steering;
    if (st) this.steerTarget = val(st.name, -st.maxSteerDeg, st.maxSteerDeg) ?? this.steerTarget;
  }

  private physicsStep(): void {
    const dt = PHYSICS_DT;
    const chassis = this.chassis;
    const rot = fromRQ(chassis.rotation());
    const wc = fromR(chassis.angvel());

    // ---- động cơ kéo: τ = τkẹt·(u − ω/ω0), giới hạn ±τkẹt
    for (const d of this.drives) {
      const w = this.wheelForwardSpin(d.wheel);
      const tau = clampAbs(d.stall * (d.u - w / d.w0), d.stall);
      const axis = qRotate(fromRQ(d.wheel.body.rotation()), v3(0, 0, 1));
      // lăn tới = quay âm quanh +z của bánh
      d.wheel.body.applyTorqueImpulse(toR(scale(axis, -tau * dt)), true);
      d.wheel.parent.applyTorqueImpulse(toR(scale(axis, tau * dt)), true);
    }

    // ---- bánh đà: trạng thái riêng, mô-men phản lực + hiệu ứng con quay lên thân
    for (const r of this.reactions) {
      const a = scale(qRotate(rot, v3(1, 0, 0)), r.model.axisSign);
      const sBody = dot(wc, a);
      r.spinRel = r.spinAbs - sBody;
      const wCmd = -r.spinRel; // chiều lệnh dương
      const tauW = clampAbs(r.stall * (r.u - wCmd / r.w0), r.stall);
      const bearing = PHYSICS.flywheelBearing * r.spinRel;
      const I = r.model.spinInertia;
      // mô-men lên bánh đà: −τ·a − ma sát; lên thân: ngược lại, cộng phản lực con quay −ω×h
      const h = scale(a, I * r.spinAbs);
      const gyro = scale(cross(wc, h), -1);
      chassis.applyTorqueImpulse(toR(scale(add(scale(a, tauW + bearing), gyro), dt)), true);
      r.spinAbs += ((-tauW - bearing) / I) * dt;
      // bão hoà: không vượt quá tốc độ không tải
      const relMax = r.w0 * 1.05;
      const rel = r.spinAbs - sBody;
      if (Math.abs(rel) > relMax) r.spinAbs = sBody + Math.sign(rel) * relMax;
      r.angle += r.spinRel * dt;
    }

    // ---- servo lái: giới hạn tốc độ quay
    if (this.steerJoint && this.vehicle.steering) {
      const maxStep = this.vehicle.steering.slewDegPerS * dt;
      this.steerAngle += clampAbs(this.steerTarget - this.steerAngle, maxStep);
      // quay dương quanh +y đưa mũi bánh về −z; lệnh servo dương = lái về +z ("trái")
      this.steerJoint.configureMotorPosition(-this.steerAngle * DEG, PHYSICS.servoStiffness, PHYSICS.servoDamping);
    }

    // ---- nhiễu đẩy
    if (this.time >= this.nextPushT && !this.ended) {
      const p = PHYSICS.push;
      const mag = this.pushRng.range(p.minImpulse, p.maxImpulse) * PUSH_FACTOR[this.cfg.realism] * this.pushRng.sign();
      this.push(mag);
      this.nextPushT = this.time + this.pushRng.range(p.minIntervalS, p.maxIntervalS);
    }

    this.world.step();
    this.stepCount++;

    // ---- gia tốc cho IMU
    const lv = fromR(chassis.linvel());
    const av = fromR(chassis.angvel());
    this.accCom = scale(sub(lv, this.prevLinvel), 1 / dt);
    this.alpha = scale(sub(av, this.prevAngvel), 1 / dt);
    this.prevLinvel = lv;
    this.prevAngvel = av;

    const ctx = this.sensorCtx;
    ctx.t = this.time;
    ctx.position = fromR(chassis.translation());
    ctx.rotation = fromRQ(chassis.rotation());
    ctx.angvel = av;
    for (const ch of this.channels) ch.update(ctx);

    this.updateStatus(false);
  }

  // ------------------------------------------------------------------ trạng thái & kết thúc

  private updateStatus(initial: boolean): void {
    const t = this.time;
    const rot = fromRQ(this.chassis.rotation());
    this.roll = eulerYZX(rot).roll;
    const absRoll = Math.abs(this.roll);
    this.maxRoll = Math.max(this.maxRoll, absRoll);
    if (absRoll > SCORING.balancedRollDeg) this.streakStart = t;
    this.bestStreak = Math.max(this.bestStreak, t - this.streakStart);
    if (this.ended || initial) return;

    const pos = fromR(this.chassis.translation());
    const m = this.map;

    if (m.kind === 'open') {
      for (const c of m.checkpoints) {
        const need = Number(c.id.replace(/\D/g, ''));
        if (!this.passed.includes(c.id) && this.bestStreak >= need - 1e-9) this.passed.push(c.id);
      }
    } else if (this.stepCount % 5 === 0) {
      this.proj = projectOnPath(m.path, pos.x, pos.z);
      const next = m.checkpoints[this.passed.length];
      if (next && this.proj.s >= next.s && this.proj.s - next.s < 0.3) this.passed.push(next.id);
    }

    if (absRoll > SCORING.fallRollDeg) return this.finish('fell');
    if (this.stepCount % PHYSICS.contactCheckEvery === 0 && this.bodyTouchesGround()) return this.finish('fell');
    if (pos.y < -0.3) return this.finish('out_of_bounds');
    if (m.kind === 'open') {
      const d = Math.hypot(pos.x - m.start.position[0], pos.z - m.start.position[2]);
      if (d > BALANCE_FLAT.boundsRadius) return this.finish('out_of_bounds');
    } else if (this.proj) {
      const p = this.proj;
      if (Math.abs(p.lateral) > m.laneWidth / 2 + SCORING.laneOutMargin) return this.finish('out_of_bounds');
      if (p.s < -0.1 || p.s > m.totalLength + 0.1) return this.finish('out_of_bounds');
      const seg = m.path[p.index];
      if (seg.role === 'seesaw' && m.seesaw) {
        const u = p.s - seg.s0;
        if (u > 0.05 && u < seg.length - 0.05 && Math.abs(p.lateral) > m.seesaw.width / 2 + SCORING.bridgeOutMargin) {
          return this.finish('out_of_bounds');
        }
      }
    }
    if (m.kind === 'course' && this.passed.length === m.checkpoints.length) return this.finish('completed');
    if (t >= this.cfg.maxTimeS - 1e-9) return this.finish(m.kind === 'open' ? 'completed' : 'timeout');
  }

  private bodyTouchesGround(): boolean {
    for (const c of this.chassisColliders) {
      for (const g of this.groundColliders) {
        let touch = false;
        this.world.contactPair(c, g, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++) if (manifold.contactDist(i) <= 0.0005) touch = true;
        });
        if (touch) return true;
      }
    }
    return false;
  }

  private finish(reason: RunEndReason, errorMessage?: string): void {
    if (this.ended) return;
    const timeS = Math.round(this.time * 1000) / 1000;
    const balancedS = Math.round(this.bestStreak * 1000) / 1000;
    const maxRollDeg = Math.round(this.maxRoll * 100) / 100;
    this.ended = {
      mapId: this.cfg.mapId as MapId,
      reason,
      timeS,
      checkpoints: [...this.passed],
      maxRollDeg,
      balancedS,
      score: computeScore({ mapId: this.cfg.mapId, reason, timeS, checkpoints: this.passed.length, maxRollDeg, balancedS }),
      ...(errorMessage ? { errorMessage } : {}),
    };
  }

  /** Dừng lượt chạy từ bên ngoài (người dùng bấm dừng, code lỗi, quá thời gian watchdog). */
  abort(reason: 'stopped' | 'code_error', errorMessage?: string): void {
    this.finish(reason, errorMessage);
  }

  // ------------------------------------------------------------------ đọc

  sensors(): SensorFrame {
    const values: Record<string, SensorValue> = {};
    let imu: ImuReading | null = null;
    for (const ch of this.channels) {
      if (ch.model.spec.kind === 'imu') {
        if (!imu) imu = ch.current as ImuReading;
        continue;
      }
      values[ch.model.name] = ch.current as SensorValue;
    }
    return { t: this.time, values, imu };
  }

  snapshot(): SimSnapshot {
    const rot = fromRQ(this.chassis.rotation());
    const pos = fromR(this.chassis.translation());
    const parts: BodyPose[] = this.wheels.map((w) => ({
      id: w.model.uid,
      position: toVec3(fromR(w.body.translation())),
      quaternion: toQuat(fromRQ(w.body.rotation())),
    }));
    for (const r of this.reactions) {
      const part = this.cfg.design.parts.find((p) => p.uid === (r.model.flywheelUid ?? r.model.uid));
      const mount = qFromEulerDeg(part?.rotationDeg ?? [0, 0, 0]);
      const spin = qAxisAngle(v3(1, 0, 0), r.angle * r.model.axisSign);
      parts.push({
        id: r.model.flywheelUid ?? r.model.uid,
        position: toVec3(add(pos, qRotate(rot, r.model.position))),
        quaternion: toQuat(qMul(qMul(rot, spin), mount)),
      });
    }
    const dynamic: BodyPose[] = this.seesawBody
      ? [{ id: 'seesaw', position: toVec3(fromR(this.seesawBody.translation())), quaternion: toQuat(fromRQ(this.seesawBody.rotation())) }]
      : [];
    const fwd = qRotate(rot, v3(1, 0, 0));
    return {
      t: this.time,
      bike: { id: 'bike', position: toVec3(pos), quaternion: toQuat(rot) },
      parts,
      dynamic,
      rollDeg: this.roll,
      speed: dot(fromR(this.chassis.linvel()), fwd),
      checkpoints: [...this.passed],
    };
  }

  push(impulse: number): void {
    if (!Number.isFinite(impulse) || impulse === 0) return;
    const rot = fromRQ(this.chassis.rotation());
    const lat = qRotate(rot, v3(0, 0, 1));
    const horiz = v3(lat.x, 0, lat.z);
    const n = length(horiz) > 1e-6 ? scale(horiz, 1 / length(horiz)) : v3(0, 0, 1);
    const com = fromR(this.chassis.worldCom());
    this.chassis.applyImpulseAtPoint(toR(scale(n, impulse)), toR(com), true);
  }

  result(): RunResult | null {
    return this.ended;
  }

  /** Tốc độ bánh đà (vòng/giây) theo tên động cơ — tiện cho biểu đồ/giao diện. */
  flywheelRps(name: string): number {
    const r = this.reactions.find((x) => x.model.name === name);
    return r ? -r.spinRel / (2 * Math.PI) : 0;
  }

  /** Góc nghiêng thật (độ, không nhiễu). */
  get trueRollDeg(): number {
    return this.roll;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world?.free();
  }
}

function clampAbs(x: number, m: number): number {
  return x > m ? m : x < -m ? -m : x;
}

/** Tạo engine mới (chưa init). */
export function createSimEngine(): RapierSimEngine {
  return new RapierSimEngine();
}

