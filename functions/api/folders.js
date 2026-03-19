import { getGoogleAuthToken } from '../utils/googleAuth.js';

/**
 * Helper to fetch a valid Google Auth Token
 */
async function getDriveAuthToken(env) {
  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is missing.");
    }
    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const scopes = ['https://www.googleapis.com/auth/drive'];
    return await getGoogleAuthToken(serviceAccount, scopes);
  } catch (err) {
    throw new Error(`Auth failed: ${err.message}`);
  }
}

/**
 * Handle GET requests to list all folders
 */
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM folders ORDER BY dibuat_pada DESC').all();
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

/**
 * Handle POST requests to create a new folder
 */
export async function onRequestPost({ request, env }) {
  try {
    const { nama_folder } = await request.json();

    if (!nama_folder) {
      return new Response(JSON.stringify({ error: 'nama_folder is required' }), { status: 400 });
    }

    // 1. Authenticate with Google API
    const token = await getDriveAuthToken(env);

    // 2. Create the folder in Google Drive
    // If you have a root parent folder, you can specify it in the `parents` array
    const parentFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID; // Define this in Cloudflare Environment Variables

    const driveMetadata = {
      name: nama_folder,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
        driveMetadata.parents = [parentFolderId];
    }

    const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(driveMetadata),
    });

    const driveData = await driveResponse.json();

    if (!driveResponse.ok) {
      throw new Error(`Google Drive API error: ${driveData.error?.message || 'Unknown error'}`);
    }

    const drive_folder_id = driveData.id;

    // 3. Save the folder data into D1 Database
    const result = await env.DB.prepare(
      'INSERT INTO folders (nama_folder, drive_folder_id) VALUES (?, ?) RETURNING *'
    ).bind(nama_folder, drive_folder_id).first();

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

/**
 * Handle PUT requests to rename a folder
 */
export async function onRequestPut({ request, env }) {
  try {
    const { id, nama_folder } = await request.json();

    if (!id || !nama_folder) {
      return new Response(JSON.stringify({ error: 'id and nama_folder are required' }), { status: 400 });
    }

    // 1. Get current folder info from D1
    const folder = await env.DB.prepare('SELECT drive_folder_id FROM folders WHERE id = ?').bind(id).first();

    if (!folder) {
      return new Response(JSON.stringify({ error: 'Folder not found' }), { status: 404 });
    }

    // 2. Authenticate and update folder name in Google Drive
    const token = await getDriveAuthToken(env);
    const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folder.drive_folder_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: nama_folder }),
    });

    if (!driveResponse.ok) {
        const driveData = await driveResponse.json();
        throw new Error(`Google Drive API error: ${driveData.error?.message || 'Unknown error'}`);
    }

    // 3. Update folder name in D1 Database
    await env.DB.prepare('UPDATE folders SET nama_folder = ? WHERE id = ?').bind(nama_folder, id).run();

    return new Response(JSON.stringify({ message: 'Folder renamed successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

/**
 * Handle DELETE requests to delete a folder
 */
export async function onRequestDelete({ request, env }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), { status: 400 });
    }

    // 1. Get current folder info from D1
    const folder = await env.DB.prepare('SELECT drive_folder_id FROM folders WHERE id = ?').bind(id).first();

    if (!folder) {
      return new Response(JSON.stringify({ error: 'Folder not found' }), { status: 404 });
    }

    // 2. Authenticate and delete folder in Google Drive
    const token = await getDriveAuthToken(env);
    const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folder.drive_folder_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!driveResponse.ok && driveResponse.status !== 404) {
        // Ignore 404 if the folder is already deleted in Google Drive
        const driveData = await driveResponse.json();
        throw new Error(`Google Drive API error: ${driveData.error?.message || 'Unknown error'}`);
    }

    // 3. Delete folder from D1 Database
    // Note: Due to ON DELETE CASCADE on the students table, all students in this folder will also be deleted
    await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ message: 'Folder deleted successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
