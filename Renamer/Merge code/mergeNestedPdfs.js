const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// HELPER: Removes ".pdf", trailing dots, and trailing spaces so comparisons are 100% accurate
const normalizeName = (name) => name.replace(/\.pdf$/i, '').replace(/[\.\s]+$/, '').toLowerCase();

async function processDirectory(currentPath) {
    try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        let pdfFiles = [];
        let subDirectories = [];
        let isAlreadyMerged = false;
        let existingMergedFile = '';

        const folderName = path.basename(currentPath);
        const expectedCleanName = normalizeName(folderName);

        // 1. Scan the folder contents
        for (let entry of entries) {
            if (entry.isDirectory()) {
                subDirectories.push(entry.name);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                const fileCleanName = normalizeName(entry.name);
                
                // SMART SKIP: If the file name matches the folder name (ignoring dots/spaces/case)
                if (fileCleanName === expectedCleanName) {
                    isAlreadyMerged = true;
                    existingMergedFile = entry.name; // Remember the actual name to log it
                } else {
                    // Only add to the merge list if it's NOT the final file
                    pdfFiles.push(entry.name);
                }
            }
        }

        // 2. THE SKIP LOGIC
        if (isAlreadyMerged) {
            console.log(`\n⏭️  Skipping folder: ${folderName} (Found existing: "${existingMergedFile}")`);
        } 
        // 3. MERGE LOGIC
        else if (pdfFiles.length > 0) {
            pdfFiles.sort();
            console.log(`\n⚙️  Found ${pdfFiles.length} PDFs in: ${currentPath}`);
            console.log('Downloading and loading files concurrently...');

            const mergedPdf = await PDFDocument.create();
            
            // Keep the naming convention clean for new merges (removes trailing dots/spaces from folder name)
            const cleanFolderName = folderName.replace(/[\.\s]+$/, '');
            const outputFileName = `${cleanFolderName}.pdf`;
            const outputPath = path.join(currentPath, outputFileName);

            const loadedPdfs = await Promise.all(
                pdfFiles.map(async (file) => {
                    const filePath = path.join(currentPath, file);
                    try {
                        const pdfBytes = await fs.readFile(filePath);
                        return await PDFDocument.load(pdfBytes);
                    } catch (err) {
                        console.error(`  -> Failed to load ${file}:`, err.message);
                        return null; 
                    }
                })
            );

            console.log('Merging pages...');
            
            for (const pdfDoc of loadedPdfs) {
                if (pdfDoc) { 
                    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            }

            console.log('Saving back to network...');
            const mergedPdfBytes = await mergedPdf.save();
            await fs.writeFile(outputPath, mergedPdfBytes);
            console.log(`✅  Success! Saved to: ${outputPath}`);
        }

        // 4. Quickly jump to the next sub-directories
        for (const subDir of subDirectories) {
            const nextPath = path.join(currentPath, subDir);
            await processDirectory(nextPath);
        }

    } catch (error) {
        console.error(`❌  Error processing directory ${currentPath}:`, error);
    }
}

// --- Configuration ---
const ROOT_DIRECTORY = '//192.168.50.77/records_scanfiles/SCANNED 201 FILES REGULAR EMPLOYEES'; 

console.log('🚀 Starting high-speed folder scan with Smart Auto-Skip...');
processDirectory(ROOT_DIRECTORY)
    .then(() => console.log('\n🎉 All folders processed successfully!'))
    .catch(err => console.error(err));