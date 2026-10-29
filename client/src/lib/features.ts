// The app is currently trimmed to Student's Affair > Students (core fields, Import, Export,
// Degrees Profile, Users) plus Preferences. Everything else is only hidden, not removed: flip this to
// bring every module, ribbon action, form tab and field back.
export const SHOW_EXTENDED_FEATURES = false;

// Module tabs that stay visible while SHOW_EXTENDED_FEATURES is off.
export const CORE_MODULE_KEYS = ["students", "configuration", "control"];
