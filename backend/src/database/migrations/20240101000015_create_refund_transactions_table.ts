import { Knex } from 'knex';

/**
 * Create refund_transactions table
 * 
 * Tracks cryptocurrency refund transactions that are queued and processed
 * to send funds back to buyers' original deposit addresses.
 * 
 * Requirements: 14.3, 14.4
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refund_transactions', (table) => {
    // Primary key
    table.uuid('id').primary();

    // Foreign keys
    table.uuid('order_id').notNullable();
    table.uuid('subscription_id').notNullable();
    table.uuid('buyer_id').notNullable();

    // Refund details
    table.string('to_address', 255).notNullable().comment('Original deposit address to send refund to');
    table.decimal('amount', 20, 8).notNullable().comment('Refund amount in cryptocurrency');
    table.string('currency', 20).notNullable().comment('Cryptocurrency type');

    // Status tracking
    table.string('status', 20).notNullable().defaultTo('queued')
      .comment('Status: queued, processing, completed, failed');
    table.string('transaction_hash', 255).nullable().comment('Blockchain transaction hash if completed');
    table.text('error').nullable().comment('Error message if failed');
    table.integer('attempt_count').notNullable().defaultTo(0).comment('Number of processing attempts');

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at').nullable().comment('When refund was successfully processed');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key constraints
    table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
    table.foreign('subscription_id').references('id').inTable('subscriptions').onDelete('CASCADE');
    table.foreign('buyer_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('order_id', 'idx_refund_transactions_order');
    table.index('subscription_id', 'idx_refund_transactions_subscription');
    table.index('buyer_id', 'idx_refund_transactions_buyer');
    table.index('status', 'idx_refund_transactions_status');
    table.index('created_at', 'idx_refund_transactions_created');
    table.index('transaction_hash', 'idx_refund_transactions_tx_hash');
  });

  console.log('Created refund_transactions table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refund_transactions');
  console.log('Dropped refund_transactions table');
}
