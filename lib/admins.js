import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from '@/src/db/pool.js';
import { PERMISSION_IDS, ROLES } from './permissions';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;

export class AdminError extends Error {}

// ---------- passwords ----------

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const expectedBuf = Buffer.from(expected, 'base64url');
  return expectedBuf.length === actual.length && timingSafeEqual(actual, expectedBuf);
}

// Used when the username doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = 'scrypt$c2FsdHNhbHRzYWx0c2FsdA$' + 'A'.repeat(86);

// ---------- validation ----------

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

function cleanUsername(username) {
  const u = String(username ?? '').trim();
  if (!USERNAME_RE.test(u)) throw new AdminError('Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.');
  return u;
}

function checkPassword(password) {
  const p = String(password ?? '');
  if (p.length < 8) throw new AdminError('Passwords must be at least 8 characters.');
  if (p.length > 200) throw new AdminError('That password is too long.');
  return p;
}

function cleanAccess(role, permissions) {
  if (!ROLES[role]) throw new AdminError('Pick a role.');
  const list = role === 'custom' ? [...new Set((permissions ?? []).filter((p) => PERMISSION_IDS.includes(p)))] : [];
  return { role, permissions: list };
}

// ---------- reads ----------

const toAdmin = (row) =>
  row && {
    id: row.id,
    username: row.username,
    role: row.role,
    permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions ?? []),
    sessionVersion: row.session_version,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };

export async function countAdmins() {
  const [r] = await query('SELECT COUNT(*) AS n FROM admins');
  return Number(r.n);
}

export async function getAdmin(id) {
  const rows = await query('SELECT * FROM admins WHERE id = ?', [id]);
  return toAdmin(rows[0]);
}

export async function listAdmins() {
  return (await query('SELECT * FROM admins ORDER BY role = "super" DESC, username')).map(toAdmin);
}

/** Returns the admin if the username and password match, otherwise null. */
export async function authenticate(username, password) {
  const rows = await query('SELECT * FROM admins WHERE username = ?', [String(username ?? '').trim()]);
  const row = rows[0];
  const ok = await verifyPassword(String(password ?? ''), row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;
  await query('UPDATE admins SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
  return toAdmin(row);
}

// ---------- writes ----------

/** First run only: creates the first super admin, but only while there are no admins at all. */
export async function createFirstSuperAdmin(username, password) {
  const u = cleanUsername(username);
  const hash = await hashPassword(checkPassword(password));
  const res = await query(
    `INSERT INTO admins (username, password_hash, role, permissions)
     SELECT ?, ?, 'super', JSON_ARRAY() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM admins)`,
    [u, hash],
  );
  if (!res.affectedRows) throw new AdminError('An admin account already exists. Please sign in.');
  return getAdmin(res.insertId);
}

export async function createAdmin({ username, password, role, permissions }, createdBy) {
  const u = cleanUsername(username);
  const access = cleanAccess(role, permissions);
  const hash = await hashPassword(checkPassword(password));
  try {
    const res = await query('INSERT INTO admins (username, password_hash, role, permissions, created_by) VALUES (?, ?, ?, ?, ?)', [
      u,
      hash,
      access.role,
      JSON.stringify(access.permissions),
      createdBy ?? null,
    ]);
    return getAdmin(res.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AdminError('That username is taken.');
    throw err;
  }
}

async function countSupers(exceptId) {
  const [r] = await query("SELECT COUNT(*) AS n FROM admins WHERE role = 'super' AND id <> ?", [exceptId ?? 0]);
  return Number(r.n);
}

/** Changes role/permissions and/or password. Keeps at least one super admin. */
export async function updateAdmin(id, { role, permissions, password }) {
  const current = await getAdmin(id);
  if (!current) throw new AdminError('That admin no longer exists.');

  if (role !== undefined) {
    const access = cleanAccess(role, permissions);
    if (current.role === 'super' && access.role !== 'super' && (await countSupers(id)) === 0) {
      throw new AdminError('You need at least one super admin. Make someone else a super admin first.');
    }
    await query('UPDATE admins SET role = ?, permissions = ? WHERE id = ?', [access.role, JSON.stringify(access.permissions), id]);
  }
  if (password) {
    const hash = await hashPassword(checkPassword(password));
    // Bumping the version signs this admin out everywhere.
    await query('UPDATE admins SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [hash, id]);
  }
  return getAdmin(id);
}

export async function deleteAdmin(id, actingAdminId) {
  if (Number(id) === Number(actingAdminId)) throw new AdminError('You can’t delete your own account.');
  const target = await getAdmin(id);
  if (!target) return;
  if (target.role === 'super' && (await countSupers(id)) === 0) throw new AdminError('You can’t delete the last super admin.');
  await query('DELETE FROM admins WHERE id = ?', [id]);
}
