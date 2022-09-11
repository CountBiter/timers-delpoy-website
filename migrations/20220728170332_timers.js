/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("timers", (table) => {
    table.increments("_id");
    table.string("description").notNullable();
    table.boolean("isActive").defaultTo(true);
    table.bigInteger("start", 255);
    table.string("user_timer_id", 255);
    table.bigInteger("end", 255);
    table.bigInteger("duration", 255);
    table.string("id").unique();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("timers");
};
