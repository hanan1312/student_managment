// The app is currently trimmed to Student's Affair > Students (core fields, Import, Export,
// Degrees Profile, Users) plus Preferences. Everything else is only hidden, not removed: flip this to
// bring every module, ribbon action, form tab and field back.
export const SHOW_EXTENDED_FEATURES = false;

// Module tabs that stay visible while SHOW_EXTENDED_FEATURES is off.
export const CORE_MODULE_KEYS = ["students", "academicYears", "configuration", "controlPanel", "control"];

// Tabs a user without access never sees: no greyed-out tab, and their address leads to the home
// page. Other tabs a user can't open still show greyed out, with a "no access" notice.
export const HIDDEN_WITHOUT_ACCESS = ["configuration", "controlPanel"];
