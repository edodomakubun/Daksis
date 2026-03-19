/**
 * --- FRONTEND SNIPPETS ---
 * Make sure to include JSZip library in your HTML:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
 */

// ----------------------------------------------------------------------
// 1. Upload File (Client-Side)
// ----------------------------------------------------------------------

/**
 * Uploads a document file to the backend API.
 *
 * @param {File} file - The file object from the file input element.
 * @param {string} studentId - The ID of the student from D1 database.
 * @param {string} docType - The type of document ('KK', 'Akte', 'KTP', 'Foto').
 * @param {string} [catatan] - Optional notes.
 */
async function uploadDocument(file, studentId, docType, catatan = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('student_id', studentId);
    formData.append('doc_type', docType);
    if (catatan) {
        formData.append('catatan', catatan);
    }

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData, // fetch will automatically set the correct Content-Type for FormData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload document');
        }

        console.log('Upload successful:', data);
        alert(`Berhasil mengunggah ${data.fileName}`);

        // You might want to refresh the UI here to show the uploaded document

    } catch (error) {
        console.error('Error uploading document:', error);
        alert(`Gagal mengunggah: ${error.message}`);
    }
}

// Example usage of uploadDocument:
// document.getElementById('uploadForm').addEventListener('submit', (e) => {
//     e.preventDefault();
//     const fileInput = document.getElementById('fileInput');
//     const studentId = document.getElementById('studentId').value;
//     const docType = document.getElementById('docType').value;
//     const catatan = document.getElementById('catatan').value;
//
//     if (fileInput.files.length > 0) {
//         uploadDocument(fileInput.files[0], studentId, docType, catatan);
//     }
// });

// ----------------------------------------------------------------------
// 2. Client-Side Zipping with JSZip
// ----------------------------------------------------------------------

/**
 * Downloads files from an array of URLs, bundles them into a ZIP file,
 * and triggers a download in the browser.
 *
 * @param {Array<{url: string, filename: string}>} files - Array of file objects containing URL and desired filename.
 * @param {string} zipName - The desired name for the downloaded ZIP file.
 */
async function downloadAndZipFiles(files, zipName = 'arsip_kelas.zip') {
    if (typeof JSZip === 'undefined') {
        alert('JSZip library is not loaded!');
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder("arsip_dokumen");

    // UI Feedback (Optional: Add a progress bar update here)
    console.log(`Starting download for ${files.length} files...`);

    try {
        // We use Promise.all to download multiple files in parallel
        // For very large numbers of files, you might want to process them in batches
        const downloadPromises = files.map(async (fileObj) => {
            try {
                // Note: The URLs must allow CORS, or be proxied via your own backend
                // If Google Drive URLs don't allow CORS directly to the browser,
                // you might need a simple proxy endpoint in your Cloudflare Worker.
                const response = await fetch(fileObj.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${fileObj.url} (Status: ${response.status})`);
                }
                const blob = await response.blob();
                folder.file(fileObj.filename, blob);
                console.log(`Downloaded ${fileObj.filename}`);
            } catch (err) {
                console.error(`Error downloading ${fileObj.filename}:`, err);
                // Optionally handle individual file failure (e.g., add a text file in zip noting the failure)
                folder.file(`${fileObj.filename}_ERROR.txt`, `Gagal mendownload: ${err.message}`);
            }
        });

        await Promise.all(downloadPromises);

        console.log('All downloads completed. Generating ZIP...');

        // Generate the ZIP file as a Blob
        const content = await zip.generateAsync({ type: 'blob' });

        // Trigger download using FileSaver.js or native approach
        if (typeof saveAs !== 'undefined') {
            saveAs(content, zipName);
        } else {
            // Fallback if FileSaver is not available
            const url = window.URL.createObjectURL(content);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }

        console.log('ZIP generated and download triggered!');

    } catch (error) {
        console.error('Error in zipping process:', error);
        alert('Terjadi kesalahan saat membuat file ZIP.');
    }
}

// Example usage of downloadAndZipFiles:
//
// // Assume we fetched this list from our backend API for a specific class folder
// const fileList = [
//     { url: 'https://example.com/proxy/file1.pdf', filename: 'KK_Budi_Santoso_12345.pdf' },
//     { url: 'https://example.com/proxy/file2.jpg', filename: 'Akte_Budi_Santoso_12345.jpg' },
//     { url: 'https://example.com/proxy/file3.png', filename: 'Foto_Siti_Aminah_67890.png' }
// ];
//
// document.getElementById('btnDownloadZip').addEventListener('click', () => {
//     downloadAndZipFiles(fileList, 'Arsip_Kelas_1_SD_Inpres.zip');
// });
