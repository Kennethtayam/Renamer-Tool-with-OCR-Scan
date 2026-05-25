const fs = require('fs').promises;
const path = require('path');

async function pullOutPdfs(currentPath, destinationRoot) {
    try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (let entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively search deeper into folders (e.g., DONE MERGE -> a -> Abacan, Raquel Sp)
                await pullOutPdfs(fullPath, destinationRoot);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                
                // We found a PDF! Let's define where we want to copy it.
                // This drops ALL PDFs into a single flat directory for easy access.
                const finalDestinationPath = path.join(destinationRoot, entry.name);

                console.log(`🚚 Pulling out: ${entry.name}`);
                
                try {
                    // Copy the file to the flat destination folder
                    await fs.copyFile(fullPath, finalDestinationPath);
                    
                    // OPTIONAL: Uncomment the line below if you want to DELETE the file from the old folder after pulling it out
                    // await fs.unlink(fullPath); 

                } catch (copyErr) {
                    console.error(`❌ Failed to move ${entry.name}:`, copyErr.message);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Error scanning directory ${currentPath}:`, error.message);
    }
}

// --- Configuration ---
// Path where your nested folders currently live
const SOURCE_DIRECTORY = '//192.168.50.77/records_scanfiles/DONE MERGE'; 

// Path where you want all the PDFs to be dropped together cleanly
const DESTINATION_DIRECTORY = '//192.168.50.77/records_scanfiles/ALL_FINAL_PDFS';

async function startProcess() {
    try {
        // Ensure the destination folder exists before starting
        await fs.mkdir(DESTINATION_DIRECTORY, { recursive: true });
        
        console.log('🚀 Starting PDF extraction process...');
        await pullOutPdfs(SOURCE_DIRECTORY, DESTINATION_DIRECTORY);
        console.log('\n🎉 Extraction complete! All PDFs have been pulled out into one folder.');
    } catch (err) {
        console.error(err);
    }
}

startProcess();