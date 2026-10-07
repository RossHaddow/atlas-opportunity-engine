import { MODULE_MANIFEST, WeirdThingsModule } from "./moduleAdapter.js";

const REQUIRED_SERVICES = ["storage", "dashboard", "tasks", "notifications", "scheduling"];
const ROUTES = [
  ["GET", "/api/weird-things/dashboard", "getDashboard"], ["GET", "/api/weird-things/command-center", "getCommandCenter"],
  ["POST", "/api/weird-things/intake", "submitIntake"], ["POST", "/api/weird-things/events/:eventId/review", "reviewEvent"],
  ["POST", "/api/weird-things/sources/:sourceId/ingest", "ingestSource"], ["POST", "/api/weird-things/alerts/evaluate", "evaluateAlerts"]
];

export function validateInstallation(core) {
  const missing = REQUIRED_SERVICES.filter((name) => !core[name]);
  if (missing.length) throw new Error(`Atlas Core is missing required services: ${missing.join(", ")}`);
  if (!core.registry?.register) throw new Error("Atlas Core registry.register is required");
  if (!core.routes?.register) throw new Error("Atlas Core routes.register is required");
  if (!core.storage?.read || !core.storage?.write) throw new Error("Atlas Core storage must implement read and write");
  return true;
}

export function installWeirdThingsModule(core) {
  validateInstallation(core);
  const stored = core.storage.read("modules/weird_things_tracker/state") || { schema_version: 1 };
  const module = new WeirdThingsModule(stored);
  const migrate = () => core.storage.write("modules/weird_things_tracker/state", module.exportState());
  core.registry.register(MODULE_MANIFEST);
  const handlers = {
    getDashboard: (request = {}) => module.getDashboard(request.filters, request.referenceDate),
    getCommandCenter: (request = {}) => module.getCommandCenter(request.referenceDate),
    submitIntake: (request = {}) => module.submitIntake(request.body),
    reviewEvent: (request = {}) => module.reviewEvent(request.params?.eventId || request.eventId, request.body),
    ingestSource: (request = {}) => module.ingestSource(request.params?.sourceId || request.sourceId, request.entries || request.body),
    evaluateAlerts: (request = {}) => module.evaluateAlerts(request.referenceDate)
  };
  ROUTES.forEach(([method, path, handler]) => core.routes.register({ method, path, handler: handlers[handler] }));
  core.dashboard.register?.({ module_id: MODULE_MANIFEST.id, title: MODULE_MANIFEST.name, handler: () => module.getDashboard() });
  return { module, manifest: MODULE_MANIFEST, routes: ROUTES.map(([method, path]) => ({ method, path })), migrate };
}
