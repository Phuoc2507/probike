// Cộng tác realtime cho không gian làm việc của đội.
//
// Cách dùng (trang ghép /mo-phong):
//   const { team } = useMyTeam();
//   const ws = useTeamWorkspace(team?.id ?? null, { seed: { code: MAU_CODE, design: XE_MAU } });
//   if (!ws?.ready) return <Đang tải/>;
//   const [design, setDesign] = useDesign(ws.session);
//   const [code, setCode] = useCode(ws.session);
//   const { latest, result, start } = useRunStream(ws.session.run, (snap) => veLen3D(snap));
//   // Người bấm Thi: const id = ws.session.run.start('full_course'); mỗi bước: ws.session.run.frame(engine.snapshot());
//   //               kết thúc: ws.session.run.end(engine.result()!) rồi saveRun(team.id, result, design)
export * from './doc';
export * from './bindings';
export { useTeamWorkspace, createWorkspaceSession, type TeamWorkspace, type UseTeamWorkspaceOptions } from './useTeamWorkspace';
export { WorkspaceSession, colorFor, type SessionState, type SessionUser, type WorkspaceKind } from './session';
export { RunChannel, type RunStartInfo, type RunChannelOptions } from './run';
export { YjsBroadcastProvider } from './provider';
export { MemoryBus, MemoryTransport, SupabaseTransport, type PresenceInfo, type Transport, type TransportStatus } from './transport';
export { localStore, supabaseStore, debounceMax, isElectedSaver, PERSONAL_KEY, type SnapshotStore } from './persistence';
