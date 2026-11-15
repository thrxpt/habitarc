# Share Drizzle across authentication and application persistence

Use Drizzle as Habitarc’s shared PostgreSQL schema, query, and versioned migration layer, with Better Auth using its Drizzle adapter and `pg` retained as the connection driver. Keep raw SQL for constraints and locking where needed, while Better Auth continues to own credentials and sessions through its supported APIs. This accepts an ORM dependency and coordination with Better Auth’s generated schema in exchange for one typed persistence model and migration history across authentication and later features.
