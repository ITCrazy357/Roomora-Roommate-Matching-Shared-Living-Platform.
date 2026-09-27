import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  throw new Error('Usage: node scripts/set-admin.mjs admin@example.com');
}
// Provision an explicitly chosen, verified account. Registration always uses USER.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(
    `UPDATE users SET role = 'ADMIN', updated_at = NOW()
     WHERE email = $1 AND email_verified_at IS NOT NULL RETURNING id, email, role`,
    [email],
  );
  if (result.rowCount !== 1)
    throw new Error('No verified account found for this email.');
  console.log('Admin account:', result.rows[0].email);
} finally {
  await client.end();
}
