// Tripwire: this file throws as soon as anything executes it.
// Boozer AI must read fixture files as text only, so this must never fire.
throw new Error('BOOZER_FIXTURE_TRIPWIRE: fixture code was executed');
