// --- PDF.js & OCR ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.9.179/build/pdf.worker.min.js';
let filesArray = [];
let tempFilesArray = [];

// =========================================
// ⭐ NEW FEATURE ADDED HERE (helper functions)
// =========================================
function applyAttachmentToName(original, attachmentEnabled, attachmentValue) {
    if (!attachmentEnabled) return original;
    if (!attachmentValue) return original;
    return `${original}_${attachmentValue}`;
}

function generateModifiedMainNameForOptionA(mainName, numbering) {
    if (!numbering) return mainName;
    const num = numbering;
    if (/_Attachment$/i.test(mainName)) {
        return mainName.replace(/_Attachment$/i, match => `${match}_${num}`);
    } else if (/(_attachment)_?$/i.test(mainName)) {
        return mainName.replace(/(_attachment)_?$/i, (m) => `${m}_${num}`);
    } else {
        return `${mainName}_${num}`;
    }
}

// ===================================================
// ⭐⭐ ADDED: LOADING ANIMATION FUNCTION (OPTION 3)
// ===================================================
function startLoadingPlaceholder(input) {
    const frames = ["█▒▒▒▒▒▒", "██▒▒▒▒▒", "███▒▒▒▒", "████▒▒▒", "█████▒▒", "██████▒", "███████"];
    let index = 0;
    const interval = setInterval(() => {
        input.placeholder = "Scanning " + frames[index];
        index = (index + 1) % frames.length;
    }, 180);
    return interval;
}

// --- Utility Functions ---
function formatDate(input) {
    const date = input.replace(/[^\d.-]/g, '');
    const match = date.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
    if (match) {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        const day = match[3].padStart(2, '0');
        return `${year}.${month}.${day}`;
    }
    return date;
}

function validateFileName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '')
               .replace(/\s+/g, ' ')
               .trim();
}

function validatePDF(file) {
    const isPDF = file.type === "application/pdf" ||
                  file.name.toLowerCase().endsWith('.pdf') ||
                  (file.type === '' && file.name.toLowerCase().endsWith('.pdf'));
    
    if (!isPDF) {
        return { valid: false, reason: 'Not a PDF file' };
    }
    if (file.size > 50 * 1024 * 1024) {
        return { valid: false, reason: 'File too large (max 50MB)' };
    }
    return { valid: true };
}

function clearAllFields() {
    document.getElementById('date').value = '';
    document.getElementById('fileNameExt').value = '';
    document.getElementById('attachment').value = '';
    document.getElementById('enableDate').checked = true;
    document.getElementById('enableFileNameExt').checked = true;
    document.getElementById('enableAttachment').checked = true;
    document.getElementById('date').disabled = false;
    document.getElementById('fileNameExt').disabled = false;
    document.getElementById('attachment').disabled = false;
}

// --- Attachment Button Functions ---
function selectAttachment() {
    const att = document.getElementById("attachment");
    if (!att.disabled) {
        att.select();
        att.focus();
    }
}

function clearAttachment() {
    const att = document.getElementById("attachment");
    if (!att.disabled) {
        att.value = "";
        att.focus();
    }
}

// --- Enable / Disable Inputs ---
document.getElementById('enableDate').addEventListener('change', e => { 
    document.getElementById('date').disabled = !e.target.checked; 
});

document.getElementById('enableFileNameExt').addEventListener('change', e => { 
    document.getElementById('fileNameExt').disabled = !e.target.checked; 
});

document.getElementById('enableAttachment').addEventListener('change', e => { 
    const att = document.getElementById('attachment');
    att.disabled = !e.target.checked;
    if (e.target.checked) {
        setTimeout(() => att.select(), 50);
    }
});

// Auto-format date input
document.getElementById('date').addEventListener('blur', function() {
    this.value = formatDate(this.value);
});

// --- Name Utilities ---
function titleCasePreserveInitials(str){
    if(!str) return '';
    const parts = str.split(/\s+/).filter(Boolean);
    return parts.map(p => {
        const clean = p.replace(/[.,]/g,'');
        if(clean.length === 1 && /^[A-Z]$/i.test(clean)) return clean.toUpperCase() + '.';
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }).join(' ');
}

function normalizeSuffix(word){
    const w = word.replace(/\./g,'').toUpperCase();
    if(w === 'JR') return 'Jr.';
    if(w === 'SR') return 'Sr.';
    if(/^I{2,4}$/.test(w)) return w;
    return null;
}

// --- Extract PDF Top Region ---
async function extractRegionCanvas(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d", { alpha: false });

    await page.render({
        canvasContext: ctx,
        viewport,
        intent: "display"
    }).promise;

    const cropY = Math.round(viewport.height * 0.10);
    const cropHeight = Math.round(viewport.height * 0.23);

    const cropped = document.createElement("canvas");
    cropped.width = viewport.width;
    cropped.height = cropHeight;

    cropped.getContext("2d", { alpha: false })
        .drawImage(
            canvas,
            0, cropY, viewport.width, cropHeight,
            0, 0, viewport.width, cropHeight
        );

    return cropped;
}

// --- OCR Name Extraction ---
async function getOCRName(canvas) {
    const { data: { text } } = await Tesseract.recognize(canvas, 'eng', {
        logger: () => {},
        tessedit_pageseg_mode: 6
    });

    if (!text) return '';

    const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const candidateLines = [];

    for (const raw of lines) {
        const cleaned = raw
            .replace(/[^A-Z0-9,\.\s]/ig, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleaned) continue;
        const letters = cleaned.replace(/[^A-Z]/gi, '');
        if (letters.length < 2) continue;

        candidateLines.push(cleaned);
    }

    if (candidateLines.length === 0)
        return text.replace(/\s+/g, ' ').trim();

    let lastNameLine = null, firstMidLine = null;

    for (let i = 0; i < candidateLines.length; i++) {
        const ln = candidateLines[i];
        const words = ln.split(/\s+/);
        const noise = [
            'DAILY','TIME','RECORD','OCTOBER','CIVIL','SERVICE',
            'FORM','TOTAL','ARRIVAL','DEPARTURE','VERIFIED','SIGNED'
        ];

        const up = ln.toUpperCase();
        if (noise.some(n => up.includes(n))) continue;

        if (ln.includes(',') && ln.split(',').length >= 2) {
            const parts = ln.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                lastNameLine = parts[0];
                firstMidLine = parts.slice(1).join(' ');
                break;
            }
        }

        if (words.length <= 3) {
            if (i + 1 < candidateLines.length) {
                lastNameLine = ln;
                firstMidLine = candidateLines[i + 1];
                break;
            }
        }
    }

    if (!lastNameLine && candidateLines.length >= 1) {
        lastNameLine = candidateLines[0];
        if (candidateLines.length >= 2)
            firstMidLine = candidateLines[1];
    }

    if (!lastNameLine) return '';

    const cleanLast = lastNameLine
        .replace(/[^A-Z0-9\s\-]/ig, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanFirstRaw = firstMidLine
        ? firstMidLine.replace(/[^A-Z0-9\s\.\-]/ig, ' ').replace(/\s+/g, ' ').trim()
        : '';

    let suffix = null;
    let firstMidNoSuffix = cleanFirstRaw;

    if (cleanFirstRaw) {
        const parts = cleanFirstRaw.split(/\s+/);
        const lastToken = parts[parts.length - 1].replace(/\./g, '').toUpperCase();
        const normalized = normalizeSuffix(lastToken);

        if (normalized) {
            suffix = normalized;
            parts.pop();
            firstMidNoSuffix = parts.join(' ');
        }
    }

    let combined = titleCasePreserveInitials(cleanLast);
    if (firstMidNoSuffix)
        combined += ', ' + titleCasePreserveInitials(firstMidNoSuffix);

    if (suffix)
        combined += ' ' + suffix;

    return combined.replace(/\s+/g, ' ').trim();
}

// --- File Sorting ---
function sortFiles(criteria) {
    if (criteria === 'name') {
        filesArray.sort((a, b) => a.name.localeCompare(b.name));
    } else if (criteria === 'size') {
        filesArray.sort((a, b) => a.size - b.size);
    }
    renderFileList();
}

document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortFiles(e.target.value);
});

// --- Render File List ---
async function renderFileList() {
    const fileListDiv = document.getElementById('fileList');
    fileListDiv.innerHTML = '';
    
    if (filesArray.length === 0) {
        fileListDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No PDF files loaded. Upload a folder to begin.</p>';
        updateFileCounter();
        return;
    }

    const ocrLoading = document.createElement('div');
    ocrLoading.id = 'ocrLoadingIndicator';
    ocrLoading.style.display = 'block';
    ocrLoading.style.position = 'fixed';
    ocrLoading.style.top = '20px';
    ocrLoading.style.left = '50%';
    ocrLoading.style.transform = 'translateX(-50%)';
    ocrLoading.style.background = 'rgba(0,0,0,0.8)';
    ocrLoading.style.color = 'white';
    ocrLoading.style.padding = '15px 25px';
    ocrLoading.style.borderRadius = 'var(--border-radius)';
    ocrLoading.style.fontWeight = 'bold';
    ocrLoading.style.zIndex = '10000';
    ocrLoading.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    ocrLoading.textContent = 'Processing OCR... 0%';
    document.body.appendChild(ocrLoading);

    for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];

        const progressPercent = Math.round(((i + 1) / filesArray.length) * 100);
        ocrLoading.textContent = `Processing OCR... ${progressPercent}%`;

        const div = document.createElement('div');
        div.className = "file-item";
        div.dataset.index = i;

        div.innerHTML = `
            <div class="top-row">
                <span class="pdf-icon">📄</span>
                <span style="flex: 1; margin: 0 10px; font-size: 14px; color: #555; word-break: break-all;">${file.name}</span>
                <label style="font-size: 12px;">
                    <input type="checkbox" class="enableName" data-index="${i}" checked> 
                    Add Attachment Input
                </label>
            </div>
            <input type="text" id="newName${i}" placeholder="Scanning █▒▒▒▒▒▒">
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                Size: ${(file.size / 1024).toFixed(2)} KB
            </div>
        `;

        fileListDiv.appendChild(div);

        const checkbox = div.querySelector('.enableName');
        const input = div.querySelector(`#newName${i}`);

        checkbox.addEventListener('change', () => { 
            input.disabled = !checkbox.checked;
            updateSelectedCount();
        });

        div.addEventListener('click', (ev) => {
            if (ev.target.tagName === "INPUT") return;
            div.classList.toggle("selected");
            document.getElementById('pdfViewer').src = URL.createObjectURL(file);
            updateSelectedCount();
        });

        // START animation
        let loadingAnimation = startLoadingPlaceholder(input);

        try {
            const validation = validatePDF(file);
            if (!validation.valid) {
                div.classList.add('error-file');
                input.value = `ERROR: ${validation.reason}`;
                input.disabled = true;
                checkbox.checked = false;

                clearInterval(loadingAnimation);
                input.placeholder = "OCR failed";
                continue;
            }

            const canvas = await extractRegionCanvas(file);
            const name = await getOCRName(canvas);

            input.value = validateFileName(name || file.name.replace('.pdf', ''));

            // STOP animation
            clearInterval(loadingAnimation);
            input.placeholder = "OCR complete";

        } catch (e) {
            console.error(`Error processing ${file.name}:`, e);
            input.value = validateFileName(file.name.replace('.pdf', ''));

            clearInterval(loadingAnimation);
            input.placeholder = "OCR failed";
        }
    }

    ocrLoading.remove();
    updateFileCounter();
    updateSelectedCount();
}

// --- Update Counters ---
function updateFileCounter() {
    const counter = document.getElementById('fileCounter');
    if (filesArray.length === 0) {
        counter.textContent = 'No files loaded';
        counter.style.backgroundColor = '#f8f9fa';
    } else {
        counter.textContent = `Files loaded: ${filesArray.length}`;
        counter.style.backgroundColor = '#e6f0ff';
    }
}

function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.file-item.selected').length;
    const totalCount = filesArray.length;
    const selectedElement = document.getElementById('selectedCount');
    
    if (selectedCount > 0) {
        selectedElement.textContent = `${selectedCount} of ${totalCount} selected`;
        selectedElement.style.display = 'block';
    } else {
        selectedElement.style.display = 'none';
    }
}

// --- FOLDER UPLOAD FIXED CODE ---
const uploadBtn = document.getElementById('uploadFolderBtn');
const pdfFilesInput = document.getElementById('pdfFiles');
const uploadModal = document.getElementById('uploadConfirmModal');
const selectedFolderText = document.getElementById('selectedFolderText');
const confirmUpload = document.getElementById('confirmUpload');
const cancelUpload = document.getElementById('cancelUpload');

uploadBtn.addEventListener('click', () => { 
    pdfFilesInput.click(); 
});

pdfFilesInput.addEventListener('change', e => {
    const allFiles = Array.from(e.target.files);
    
    tempFilesArray = allFiles.filter(file => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;
        return fileName.endsWith('.pdf') || 
               fileType === 'application/pdf' ||
               (fileType === '' && fileName.endsWith('.pdf'));
    });
    
    console.log(`Found ${allFiles.length} total files, ${tempFilesArray.length} PDF files`);
    
    if (tempFilesArray.length === 0) {
        alert('No PDF files found in the selected folder. Please select a folder containing PDF files.');
        pdfFilesInput.value = '';
        return;
    }
    
    let folderName = 'Unknown Folder';
    if (tempFilesArray[0].webkitRelativePath) {
        const pathParts = tempFilesArray[0].webkitRelativePath.split('/');
        folderName = pathParts.length > 1 ? pathParts[0] : 'Root Folder';
    }
    
    selectedFolderText.innerHTML = `
        <p><strong>Folder:</strong> ${folderName}</p>
        <p><strong>PDF Files Found:</strong> ${tempFilesArray.length}</p>
        <p><strong>Uploading Files:</strong></p>
        <ul style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
            ${tempFilesArray.slice(0, 5).map(file => `<li>${file.name}</li>`).join('')}
            ${tempFilesArray.length > 5 ? `<li>... and ${tempFilesArray.length - 5} more files</li>` : ''}
        </ul>
    `;
    
    uploadModal.style.display = "block";
});

confirmUpload.addEventListener('click', async () => {
    uploadModal.style.display = "none";
    filesArray = [...tempFilesArray];
    
    const fileListDiv = document.getElementById('fileList');
    fileListDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Loading files and processing OCR...</p>';
    
    await renderFileList();
    
    pdfFilesInput.value = '';
});

cancelUpload.addEventListener('click', () => { 
    uploadModal.style.display = "none"; 
    pdfFilesInput.value = "";
    tempFilesArray = [];
});

window.addEventListener('click', e => {
    if (e.target === uploadModal) {
        uploadModal.style.display = "none";
        pdfFilesInput.value = "";
    }
});

// --- Clear All Files ---
document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (filesArray.length === 0) {
        alert('No files to clear.');
        return;
    }
    
    if (confirm(`Are you sure you want to clear all ${filesArray.length} files?`)) {
        filesArray = [];
        document.getElementById('fileList').innerHTML = '';
        updateFileCounter();
        document.getElementById('selectedCount').style.display = 'none';
        document.getElementById('pdfViewer').src = '';
    }
});

// --- Select All / Deselect All ---
document.getElementById('selectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.file-item').forEach(div => {
        div.classList.add('selected');
    });
    document.querySelectorAll('.enableName').forEach(cb => {
        cb.checked = true;
        const input = document.getElementById(`newName${cb.dataset.index}`);
        if (input) input.disabled = false;
    });
    updateSelectedCount();
});

document.getElementById('deselectAllBtn').addEventListener('click', () => {
    document.querySelectorAll('.file-item').forEach(div => {
        div.classList.remove('selected');
    });
    document.querySelectorAll('.enableName').forEach(cb => {
        cb.checked = false;
        const input = document.getElementById(`newName${cb.dataset.index}`);
        if (input) input.disabled = true;
    });
    updateSelectedCount();
});

// --- Rename Modal ---
document.getElementById('renameBtn').addEventListener('click', () => {
    if (filesArray.length === 0) {
        alert("Please upload PDF files first!");
        return;
    }

    const modal = document.getElementById('renameModal');
    const modalList = document.getElementById('modalFileList');
    modalList.innerHTML = "";

    const dateVal = document.getElementById('date').disabled ? "" : document.getElementById('date').value.trim();
    const fileExtVal = document.getElementById('fileNameExt').disabled ? "" : document.getElementById('fileNameExt').value.trim();
    const attachmentVal = document.getElementById('attachment').disabled ? "" : document.getElementById('attachment').value.trim();
    const attachmentEnabled = document.getElementById('enableAttachment').checked;

    const baseCounts = {};
    filesArray.forEach((file, i) => {
        const mainNameInput = document.getElementById(`newName${i}`);
        if (!mainNameInput) return;
        const checkbox = document.querySelector(`.enableName[data-index="${i}"]`);

        let mainName = mainNameInput.value.trim() || file.name.replace('.pdf', '');
        if (checkbox && checkbox.checked) {
            mainName = applyAttachmentToName(mainName, attachmentEnabled, attachmentVal);
        }

        const baseKey = [mainName, dateVal, fileExtVal].filter(Boolean).join("__SEP__");
        baseCounts[baseKey] = (baseCounts[baseKey] || 0) + 1;
    });

    const baseIndexMap = {};

    filesArray.forEach((file, i) => {
        const mainNameInput = document.getElementById(`newName${i}`);
        if (!mainNameInput) return;
        
        let mainName = mainNameInput.value.trim() || file.name.replace('.pdf', '');
        const checkbox = document.querySelector(`.enableName[data-index="${i}"]`);

        if (checkbox && checkbox.checked) {
            mainName = applyAttachmentToName(mainName, attachmentEnabled, attachmentVal);
        }

        const baseKey = [mainName, dateVal, fileExtVal].filter(Boolean).join("__SEP__");

        if (!baseIndexMap[baseKey]) baseIndexMap[baseKey] = 0;
        baseIndexMap[baseKey] += 1;

        const thisIndex = baseIndexMap[baseKey];

        let modifiedMainName = mainName;
        if ((baseCounts[baseKey] || 0) > 1) {
            modifiedMainName = generateModifiedMainNameForOptionA(mainName, thisIndex);
        }

        const newFileName = [modifiedMainName, dateVal, fileExtVal]
            .filter(Boolean)
            .join("_") + ".pdf";

        const div = document.createElement('div');
        div.id = `modalItem${i}`;
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.marginBottom = "8px";
        div.style.gap = "10px";

        div.innerHTML = `
            <input type="text" id="modalName${i}" value="${validateFileName(newFileName)}" style="flex: 1;">
            <button class="remove-btn" data-index="${i}">Remove</button>
        `;

        modalList.appendChild(div);

        div.querySelector('.remove-btn').addEventListener('click', e => {
            const idx = parseInt(e.target.dataset.index);
            if (confirm(`Remove "${filesArray[idx].name}" from the list?`)) {
                filesArray.splice(idx, 1);
                renderFileList();
                
                modal.style.display = "none";
                setTimeout(() => document.getElementById('renameBtn').click(), 100);
            }
        });

        div.querySelector('input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('confirmDownload').click();
            }
        });
    });

    modal.style.display = "block";
});

document.getElementById('cancelModal').addEventListener('click', () => {
    document.getElementById('renameModal').style.display = "none";
});

// --- Download ZIP ---
document.getElementById('confirmDownload').addEventListener('click', async () => {
    const zip = new JSZip();

    const loading = document.getElementById('loadingIndicator');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    loading.style.display = "block";

    let hasErrors = false;
    
    for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const nameInput = document.getElementById(`modalName${i}`);
        if (!nameInput) continue;
        
        const newFileName = validateFileName(nameInput.value.trim()) || file.name;
        
        try {
            const fileData = await file.arrayBuffer();
            zip.file(newFileName, fileData);
        } catch (error) {
            console.error(`Error adding file ${file.name}:`, error);
            hasErrors = true;
        }

        const progressPercent = Math.round(((i + 1) / filesArray.length) * 100);
        progressBar.style.width = progressPercent + "%";
        progressText.textContent = progressPercent + "%";
    }

    try {
        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, "Renamed_PDFs.zip");
        
        if (hasErrors) {
            alert("⚠ Some files may not have been included in the ZIP due to errors.");
        } else {
            alert("✔ All PDFs saved in ZIP successfully!");
        }

        document.getElementById('renameModal').style.display = "none";
    } catch (error) {
        alert("❌ Error creating ZIP file: " + error.message);
    } finally {
        loading.style.display = "none";
        progressBar.style.width = "0%";
        progressText.textContent = "0%";
    }
});

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        document.getElementById('selectAllBtn').click();
    }
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        document.getElementById('deselectAllBtn').click();
    }
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        document.getElementById('renameBtn').click();
    }
    if (e.ctrlKey && e.key === 'c' && e.shiftKey) {
        e.preventDefault();
        document.getElementById('clearAllBtn').click();
    }
});

// Close modal on background click
window.addEventListener('click', e => {
    const modal = document.getElementById('renameModal');
    if (e.target === modal) modal.style.display = "none";
});

// Initialize
updateFileCounter();