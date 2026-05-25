const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Helper to normalize names for smart-skipping
const normalizeName = (name) => name.replace(/\.pdf$/i, '').replace(/[\.\s]+$/, '').toLowerCase();

// A function to safely copy files locally
async function copyFile(src, dest) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
}

async function processDirectory(currentPath) {
    try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        let pdfFiles = [];
        let subDirectories = [];
        let isAlreadyMerged = false;
        let existingMergedFile = '';

        const folderName = path.basename(currentPath);
        const expectedCleanName = normalizeName(folderName);

        // 1. Scan network folder
        for (let entry of entries) {
            if (entry.isDirectory()) {
                subDirectories.push(entry.name);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                const fileCleanName = normalizeName(entry.name);
                
                if (fileCleanName === expectedCleanName) {
                    isAlreadyMerged = true;
                    existingMergedFile = entry.name;
                } else {
                    pdfFiles.push(entry.name);
                }
            }
        }

        // 2. SMART AUTO-SKIP
        if (isAlreadyMerged) {
            console.log(`⏭️  Skipping: ${folderName}`);
        } 
        // 3. HIGH-SPEED TEMP LOCAL MERGE
        else if (pdfFiles.length > 0) {
            pdfFiles.sort();
            console.log(`\n⚙️  Processing ${folderName} (${pdfFiles.length} files)`);
            
            // Set up a temporary staging area on your local C: drive
            const localTempDir = path.join(os.tmpdir(), 'pdf_merge_staging', folderName);
            
            // Clean up old temp directory if it exists
            await fs.rm(localTempDir, { recursive: true, force: true });
            await fs.mkdir(localTempDir, { recursive: true });

            console.log('  ⬇️  Downloading files to local C: drive...');
            // Copy all PDFs from the network to your super-fast local drive simultaneously
            await Promise.all(pdfFiles.map(file => {
                return copyFile(path.join(currentPath, file), path.join(localTempDir, file));
            }));

            const cleanFolderName = folderName.replace(/[\.\s]+$/, '');
            const outputFileName = `${cleanFolderName}.pdf`;
            const localOutputPath = path.join(localTempDir, outputFileName);
            const finalNetworkPath = path.join(currentPath, outputFileName);

            const quotedInputFiles = pdfFiles.map(file => `"${file}"`).join(' ');
            const quotedOutputFile = `"${outputFileName}"`;

            // Command targeted at the local C: drive folder
            const command = `& "C:\\Program Files (x86)\\PDFtk Server\\bin\\pdftk.exe" ${quotedInputFiles} cat output ${quotedOutputFile}`;

            console.log('  ⚡ Merging locally (instant)...');
            try {
                execSync(command, { 
                    cwd: localTempDir, 
                    shell: 'powershell.exe', 
                    stdio: 'pipe' 
                }); 

                console.log('  ⬆️  Uploading merged file back to network...');
                await fs.copyFile(localOutputPath, finalNetworkPath);
                console.log(`✅  Success! Saved to network.`);
            } catch (err) {
                console.error(`❌  Failed to merge ${folderName}.`);
                if (err.stderr) console.error(`🔍  Details:\n${err.stderr.toString()}`);
            } finally {
                // ALWAYS clean up the local C: drive so your computer doesn't fill up with space
                await fs.rm(localTempDir, { recursive: true, force: true });
            }
        }

        // 4. Move to next sub-directories
        for (const subDir of subDirectories) {
            const nextPath = path.join(currentPath, subDir);
            await processDirectory(nextPath);
        }

    } catch (error) {
        console.error(`❌  Error:`, error);
    }
}

// --- Configuration ---
const ROOT_DIRECTORY = '//192.168.50.77/records_scanfiles/Testing'; 

console.log('🚀 Starting LOCAL-ACCELERATED folder scan...');
processDirectory(ROOT_DIRECTORY)
    .then(() => console.log('\n🎉 All folders processed successfully!'))
    .catch(err => console.error(err));