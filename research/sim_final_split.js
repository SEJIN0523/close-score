// Build current dashboard simulation with the same execution engine used in the app.
// Historical v1 implementation is preserved in sim_legacy.js for comparisons.
require('./sim_execution.js').main(...process.argv.slice(2));
