import { getGoogleAuthToken } from '../utils/googleAuth.js';

/**
 * Helper to fetch a valid Google Auth Token
 */
async function getDriveAuthToken(env) {
  try {
    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const scopes = ['https://www.googleapis.com/auth/drive'];
    return await getGoogleAuthToken(serviceAccount, scopes);
  } catch (err) {
    throw new Error(`Auth failed: ${err.message}`);
  }
}

/**
 * Maps document types to their respective D1 column names
 */
const docTypeColumnMap = {
    'KK': 'link_kk',
    'Akte': 'link_akte',
    'KTP': 'link_ktp',
    'Foto': 'link_foto'
};

/**
 * Helper to generate boundary for multipart/related request
 */
function createMultipartRelatedBody(metadata, fileBuffer, mimeType, boundary) {
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const filePartHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const endBoundary = `\r\n--${boundary}--`;

    const encoder = new TextEncoder();
    const metadataPartBuffer = encoder.encode(metadataPart);
    const filePartHeaderBuffer = encoder.encode(filePartHeader);
    const endBoundaryBuffer = encoder.encode(endBoundary);

    const totalLength = metadataPartBuffer.length + filePartHeaderBuffer.length + fileBuffer.byteLength + endBoundaryBuffer.length;
    const combinedBuffer = new Uint8Array(totalLength);

    let offset = 0;
    combinedBuffer.set(metadataPartBuffer, offset);
    offset += metadataPartBuffer.length;

    combinedBuffer.set(filePartHeaderBuffer, offset);
    offset += filePartHeaderBuffer.length;

    combinedBuffer.set(new Uint8Array(fileBuffer), offset);
    offset += fileBuffer.byteLength;

    combinedBuffer.set(endBoundaryBuffer, offset);

    return combinedBuffer;
}

/**
 * Handle POST requests to upload a student document
 */
export async function onRequestPost({ request, env }) {
  try {
    // 1. Parse Multipart Form Data
    const formData = await request.formData();
    const file = formData.get('file'); // File object
    const studentId = formData.get('student_id');
    const docType = formData.get('doc_type'); // 'KK', 'Akte', 'KTP', 'Foto'
    const catatan = formData.get('catatan'); // Optional note

    if (!file || !studentId || !docType) {
        return new Response(JSON.stringify({ error: 'file, student_id, and doc_type are required' }), { status: 400 });
    }

    if (!docTypeColumnMap[docType]) {
        return new Response(JSON.stringify({ error: `Invalid doc_type. Must be one of: ${Object.keys(docTypeColumnMap).join(', ')}` }), { status: 400 });
    }

    // 2. Fetch Student and Folder Info from D1
    const query = `
        SELECT s.nama_siswa, s.nisn, f.drive_folder_id
        FROM students s
        JOIN folders f ON s.folder_id = f.id
        WHERE s.id = ?
    `;
    const studentInfo = await env.DB.prepare(query).bind(studentId).first();

    if (!studentInfo) {
        return new Response(JSON.stringify({ error: 'Student not found' }), { status: 404 });
    }

    if (!studentInfo.drive_folder_id) {
        return new Response(JSON.stringify({ error: 'Target folder is not synced with Google Drive' }), { status: 400 });
    }

    // 3. Auto-rename file
    // Format: [JenisDokumen]_[NamaSiswa]_[NISN].[ext]
    const fileExtension = file.name.split('.').pop();
    const cleanStudentName = studentInfo.nama_siswa.replace(/[^a-zA-Z0-9]/g, '_');
    const newFileName = `${docType}_${cleanStudentName}_${studentInfo.nisn}.${fileExtension}`;

    // 4. Upload to Google Drive using Multipart upload
    const token = await getDriveAuthToken(env);
    const boundary = '-------314159265358979323846';

    const fileBuffer = await file.arrayBuffer();

    const metadata = {
        name: newFileName,
        parents: [studentInfo.drive_folder_id]
    };

    const multipartBody = createMultipartRelatedBody(metadata, fileBuffer, file.type, boundary);

    const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
    });

    const driveData = await driveResponse.json();

    if (!driveResponse.ok) {
        throw new Error(`Google Drive API error: ${driveData.error?.message || 'Unknown error'}`);
    }

    // Set permission to anyone with link (if you want public URLs, otherwise skip this)
    // For this example, we assume we just store the webViewLink or webContentLink
    // The driveData initially only contains ID, name, mimeType.
    // Let's request the webViewLink
    const fileDetailsResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${driveData.id}?fields=id,name,webViewLink,webContentLink`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const fileDetails = await fileDetailsResponse.json();
    const fileUrl = fileDetails.webViewLink || `https://drive.google.com/file/d/${driveData.id}/view`;

    // 5. Update D1 Database
    const columnToUpdate = docTypeColumnMap[docType];

    let updateQuery = `UPDATE students SET ${columnToUpdate} = ?`;
    let updateParams = [fileUrl];

    if (catatan) {
        updateQuery += `, catatan = ?`;
        updateParams.push(catatan);
    }

    updateQuery += ` WHERE id = ?`;
    updateParams.push(studentId);

    await env.DB.prepare(updateQuery).bind(...updateParams).run();

    return new Response(JSON.stringify({
        message: 'File uploaded and database updated successfully',
        fileId: driveData.id,
        fileUrl: fileUrl,
        fileName: newFileName
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
