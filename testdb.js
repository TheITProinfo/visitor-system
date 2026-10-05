import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query('SELECT current_database(), current_user;');
    console.log('✅ Connection SUCCESS', res.rows[0]);
  } catch (err) {
    console.error('❌ Connection FAILED:', err.message);
  } finally {
    await pool.end();
  }
})();
