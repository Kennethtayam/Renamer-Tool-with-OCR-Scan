// --- PDF.js & OCR ---
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.9.179/build/pdf.worker.min.js';
let filesArray = [];
let tempFilesArray = [];
let uploadedFolderName = "Renamed_PDFs"; // ⭐ Added this to remember the folder name

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
    
    uploadedFolderName = folderName; // ⭐ Save it to the global variable!
    
    selectedFolderText.innerHTML = `
        <p><strong>Folder:</strong> ${folderName}</p>
        <p><strong>PDF Files Found:</strong> ${tempFilesArray.length}</p>
        <p><strong>Uploading Files:</strong></p>
        <ul style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
            ${tempFilesArray.slice(0, 5).map(file => `<li>${file.name}</li>`).join('')}
            ${tempFilesArray.length > 5 ? `<li>... and ${tempFilesArray.length - 5} more files</li>` : ''}
        </ul>
    `;
    
    uploadModal.classList.remove("hidden");
});

confirmUpload.addEventListener('click', async () => {
    uploadModal.classList.add("hidden");
    filesArray = [...tempFilesArray];
    
    const fileListDiv = document.getElementById('fileList');
    fileListDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Loading files and processing OCR...</p>';
    
    await renderFileList();
    
    pdfFilesInput.value = '';
});

cancelUpload.addEventListener('click', () => { 
    uploadModal.classList.add("hidden");
    pdfFilesInput.value = "";
    tempFilesArray = [];
});

window.addEventListener('click', e => {
    if (e.target === uploadModal) {
        uploadModal.classList.add("hidden");
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


// ================= SPLIT MODAL CONTROLS =================
const splitModal = document.getElementById("splitPdfModal");

document.getElementById("openSplitModalBtn").addEventListener("click", () => {
  splitModal.classList.remove("hidden");
});

document.getElementById("closeSplitModal").addEventListener("click", () => {
  splitModal.classList.add("hidden");
});

window.addEventListener("click", e => {
  if (e.target === splitModal) splitModal.classList.add("hidden");
});

// ================= PDF SPLITTER =================
// // Tell pdf.js where to find its worker file (required for the visual thumbnails)
 pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ================= DOM ELEMENTS =================
const splitPdfInput = document.getElementById("splitPdfInput");
const splitMode = document.getElementById("splitMode");
const pageRangeInput = document.getElementById("pageRange");
const splitPdfBtn = document.getElementById("splitPdfBtn");
const splitStatusText = document.getElementById("splitStatusText");
const splitProgressFill = document.getElementById("splitProgressFill");
const loader = document.getElementById("splitLoader");
const modal = document.getElementById("splitPdfModal");
// const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;

// Visual Thumbnail DOM Elements
const thumbnailContainer = document.getElementById("thumbnailContainer");
const thumbnailGrid = document.getElementById("thumbnailGrid");
let selectedStartPages = new Set(); // Stores the clicked pages

// ========================================================
// ⭐ AI NAME EXTRACTOR LOGIC
// ========================================================
let autoExtractedNames = {}; // Memory bank for extracted names

function extractPdsName(ocrText) {
    const text = ocrText.toUpperCase();
    let surname = "";
    let firstname = "";

    // Split the OCR text line by line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Hunt for the SURNAME
        // (Make sure we don't accidentally grab the Spouse's or Father's surname lower down)
        if (line.includes("SURNAME") && !line.includes("SPOUSE") && !line.includes("FATHER")) {
            let parts = line.split("SURNAME");
            // If the name is on the same line (e.g., "1. SURNAME BALOTCOPO")
            if (parts.length > 1 && parts[1].replace(/[^A-Z]/g, '').length > 1) {
                surname = parts[1].replace(/[^A-Z\s\-]/g, '').trim();
            } 
            // If the name dropped to the line below
            else if (i + 1 < lines.length) {
                surname = lines[i+1].replace(/[^A-Z\s\-]/g, '').trim();
            }
        }

        // 2. Hunt for the FIRST NAME
        if (line.includes("FIRST NAME")) {
            let parts = line.split("FIRST NAME");
            if (parts.length > 1) {
                // Grab everything before the word "NAME EXTENSION"
                let namePart = parts[1].split("NAME EXTENSION")[0];
                firstname = namePart.replace(/[^A-Z\s\-]/g, '').trim();
            } else if (i + 1 < lines.length) {
                let namePart = lines[i+1].split("NAME EXTENSION")[0];
                firstname = namePart.replace(/[^A-Z\s\-]/g, '').trim();
            }
        }
    }

    // Clean up random massive spaces the OCR sometimes adds
    surname = surname.split(/\s{2,}/)[0]; 
    firstname = firstname.split(/\s{2,}/)[0];

    // Format the final file name
    if (surname && firstname) {
        return `${surname}_${firstname}`; // e.g., "BALOTCOPO_ELAINE"
    } else if (surname) {
        return surname;
    }
    return null; // Return nothing if it couldn't read it cleanly
}

// ================= EVENT LISTENERS =================

// Disable/Enable the input box & handle thumbnail visibility depending on the selected mode
splitMode.addEventListener("change", async () => {
  // Enable the input box for BOTH "range" and "starts" modes
  pageRangeInput.disabled = !["range", "starts"].includes(splitMode.value);
  if (pageRangeInput.disabled) pageRangeInput.value = "";

  // Show or generate thumbnails if "starts" mode is selected
  if (splitMode.value === "starts" && splitPdfInput.files[0]) {
    thumbnailContainer.classList.remove("hidden");
    if (thumbnailGrid.innerHTML === "") {
      await generateThumbnails(splitPdfInput.files[0]);
    }
  } else {
    thumbnailContainer.classList.add("hidden");
  }
});

// Generate thumbnails automatically when a file is uploaded (if in "starts" mode)
splitPdfInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Clear any existing thumbnails from a previous file
  thumbnailGrid.innerHTML = "";

  if (splitMode.value === "starts") {
    thumbnailContainer.classList.remove("hidden");
    await generateThumbnails(file);
  }
});


    // ================= HIGH-SPEED THUMBNAIL GENERATOR WITH AI AUTO-SELECT =================
    async function generateThumbnails(file) {
    thumbnailGrid.innerHTML = "Loading previews & scanning for PDS..."; 
    selectedStartPages.clear();
    pageRangeInput.value = ""; 

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        thumbnailGrid.innerHTML = ""; 

    const renderQueue = [];
    
    // STEP 1: Build the UI Boxes
    for (let i = 1; i <= pdf.numPages; i++) {
      const wrapper = document.createElement("div");
      wrapper.className = "thumbnail-wrapper";
      
      // Always select Page 1 by default
      if (i === 1) {
        wrapper.classList.add("selected");
        selectedStartPages.add(i);
        updateInputBox();
      }

      const canvas = document.createElement("canvas");
      canvas.width = 140; 
      canvas.height = 180; 
      canvas.style.backgroundColor = "#eaeaea"; 

      wrapper.appendChild(canvas);
      const label = document.createElement("p");
      label.textContent = `Page ${i}`;
      wrapper.appendChild(label);

      // Manual click toggle
      wrapper.addEventListener("click", () => {
        wrapper.classList.toggle("selected");
        if (selectedStartPages.has(i)) {
          selectedStartPages.delete(i);
        } else {
          selectedStartPages.add(i);
        }
        updateInputBox();
      });

      thumbnailGrid.appendChild(wrapper);
      
      // ⭐ Added 'wrapper' to the queue so the AI can click it later
      renderQueue.push({ pageNum: i, canvas: canvas, wrapper: wrapper });
    }

    // STEP 2: Render Images & Run Smart AI Detection
    const batchSize = 5;
    for (let i = 0; i < renderQueue.length; i += batchSize) {
      const batch = renderQueue.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (task) => {
        const page = await pdf.getPage(task.pageNum);
        
        // ⚡ UPGRADE 1: High-Res Render (scale: 1.0) so the AI can actually read the letters
        const viewport = page.getViewport({ scale: 1.0 }); 
        
        task.canvas.height = viewport.height;
        task.canvas.width = viewport.width;
        task.canvas.style.backgroundColor = "transparent"; 
        const ctx = task.canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // ========================================================
        // ⭐ SMART AI DETECTION START ⭐
        // ========================================================
        let isPDS = false;

        // Extract any hidden digital text first
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ").toUpperCase();
        
        // ⚡ UPGRADE 3: Fuzzy Matching (strips all spaces and punctuation)
        const cleanText = pageText.replace(/[^A-Z0-9]/g, '');

        if (cleanText.includes("PERSONALDATASHEET") || cleanText.includes("CSFORM212") || cleanText.includes("CSFORMNO212")) {
            isPDS = true;
        } 
        // If there is barely any digital text, it's a scanned image. Run OCR!
        else if (cleanText.length < 50) { 
            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = task.canvas.width;
            
            // ⚡ UPGRADE 2: Scan the top 30% of the page to be safe
            cropCanvas.height = task.canvas.height * 0.40; 
            const cropCtx = cropCanvas.getContext("2d");
            cropCtx.drawImage(task.canvas, 0, 0, task.canvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);

            try {
                // Run Tesseract OCR silently
                const { data: { text } } = await Tesseract.recognize(cropCanvas, 'eng', { logger: () => {} });
                
                // Fuzzy match the OCR result too!
                const cleanOcr = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
                
                if (cleanOcr.includes("PERSONALDATASHEET") || cleanOcr.includes("CSFORM212") || cleanOcr.includes("CSFORMNO212") || cleanOcr.includes("DATASHEET")) {
                    isPDS = true;
                    
                    // 🧠 NEW: Try to extract the employee's name!
                    const foundName = extractPdsName(text);
                    if (foundName) {
                        autoExtractedNames[task.pageNum] = foundName; // Save to memory
                        
                        // Display the name in blue text under the thumbnail!
                        task.label.innerHTML = `Page ${task.pageNum}<br><span style="color: #0056b3; font-size: 11px; font-weight: bold;">${foundName}</span>`;
                    }
                }
            } catch(e) { 
                console.log("OCR failed on page " + task.pageNum); 
            }
        }

        // If the AI found a PDS (and it's not page 1), auto-select it!
        if (isPDS && task.pageNum !== 1) {
            if (!selectedStartPages.has(task.pageNum)) {
                task.wrapper.classList.add("selected");
                selectedStartPages.add(task.pageNum);
                updateInputBox();
            }
        }
        // ========================================================
        // ⭐ SMART AI DETECTION END ⭐
        // ========================================================
      }));
    }
    
  } catch (error) {
    console.error("Error generating thumbnails:", error);
    thumbnailGrid.innerHTML = "Error loading PDF previews.";
  }
}

// Helper to push clicked thumbnails into the text box
function updateInputBox() {
  const sortedArray = Array.from(selectedStartPages).sort((a, b) => a - b);
  pageRangeInput.value = sortedArray.join(", ");
}


// ================= MAIN SPLIT LOGIC =================
splitPdfBtn.addEventListener("click", async () => {
  const file = splitPdfInput.files[0];
  if (!file) {
    alert("Please select a PDF file.");
    return;
  }

  // ▶️ START animation
  loader.classList.remove("hidden");
  modal.classList.add("processing");
  splitPdfBtn.disabled = true;
  splitStatusText.textContent = "Preparing PDF...";
  splitProgressFill.style.width = "0%";

  try {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(buffer);
    const totalPages = pdfDoc.getPageCount();
    const zip = new JSZip();

    let pageGroups = [];
    
    // Group 1: Extract every single page
    if (splitMode.value === "all") {
      pageGroups = [...Array(totalPages).keys()].map(i => [i]);
      
    // Group 2: Transmittal + 5 Pages per employee
    } else if (splitMode.value === "batch5") {
      if (totalPages > 0) pageGroups.push([0]); 
      for (let i = 1; i < totalPages; i += 5) {
        const chunk = [];
        for (let j = 0; j < 5; j++) {
          if (i + j < totalPages) chunk.push(i + j);
        }
        pageGroups.push(chunk);
      }
      
    // Group 3: Split by Starting Pages (Using Input Box / Thumbnails)
    } else if (splitMode.value === "starts") {
      let starts = pageRangeInput.value.split(",")
        .map(n => parseInt(n.trim()))
        .filter(n => !isNaN(n) && n >= 1 && n <= totalPages)
        .sort((a, b) => a - b); 

      starts = [...new Set(starts)]; // Remove duplicates

      if (starts.length === 0) {
        alert("Please enter valid starting page numbers or click the thumbnails.");
        return; // Exits safely
      }

      for (let i = 0; i < starts.length; i++) {
        let currentStart = starts[i] - 1; 
        let currentEnd = (i + 1 < starts.length) ? (starts[i + 1] - 1) : totalPages;
        
        let chunk = [];
        for (let j = currentStart; j < currentEnd; j++) {
          chunk.push(j);
        }
        if (chunk.length > 0) pageGroups.push(chunk);
      }

    // Group 4: Custom Range (1-5, 6-12)
    } else {
      pageGroups = parsePageGroups(pageRangeInput.value, totalPages);
    }

    if (!pageGroups.length) {
      alert("Invalid page range.");
      return; 
    }

    // ================= HIGH-SPEED PARALLEL SPLITTING =================
    let completedCount = 0;
    
    // ⚡ SMART BATCHING: If it's a huge file, do fewer at a time so RAM doesn't crash
    const batchSize = totalPages > 100 ? 3 : 10; 

    for (let i = 0; i < pageGroups.length; i += batchSize) {
    const batch = pageGroups.slice(i, i + batchSize);
    // ... keep the rest of your Promise.all loop exactly the same
      
      // Process the current batch of 10 all at the same time
      await Promise.all(batch.map(async (group) => {
        const newPdf = await PDFLib.PDFDocument.create();
        
        // Copy and add pages
        const copiedPages = await newPdf.copyPages(pdfDoc, group);
        copiedPages.forEach(page => newPdf.addPage(page));

        // Save to bytes
        const bytes = await newPdf.save();
        
        // Dynamic Naming
        const startPage = group[0] + 1;
        const endPage = group[group.length - 1] + 1;
        const fileName = group.length === 1 
            ? `page_${startPage}.pdf` 
            : `pages_${startPage}-${endPage}.pdf`;

        // Add to zip
        zip.file(fileName, bytes);

        // Safely update the progress bar
        completedCount++;
        const progressPercent = Math.round((completedCount / pageGroups.length) * 100);
        splitProgressFill.style.width = progressPercent + "%";
        splitStatusText.textContent = `Processing document ${completedCount} of ${pageGroups.length}...`;
      }));
    }
    // =================================================================

    // Generate zip and download (STORE = NO COMPRESSION = SUPER FAST)
    const blob = await zip.generateAsync({ 
      type: "blob",
      compression: "STORE" // ⚡ This tells JSZip to skip the slow math
    });
    
    // Name and download the final ZIP file
    const originalFileName = file.name.replace(/\.pdf$/i, "");
    saveAs(blob, `${originalFileName}_Split.zip`);

    splitStatusText.textContent = `Done! Created ${pageGroups.length} files.`;
    splitProgressFill.style.width = "100%";

    // ✅ CLOSE modal and show popup
    setTimeout(() => {
      modal.classList.add("hidden");   
      alert("Done! Split file.");      
    }, 500);

  } catch (err) {
    console.error("Error splitting PDF:", err);
    splitStatusText.textContent = "Error occurred while splitting PDF.";
  } finally {
    // ⏹️ STOP animation
    loader.classList.add("hidden");
    modal.classList.remove("processing");
    splitPdfBtn.disabled = false;
  }
});

// Helper for parsing custom ranges
function parsePageGroups(input, max) {
  if (!input) return [];
  const groups = [];

  input.split(",").forEach(part => {
    const set = new Set();
    if (part.includes("-")) {
      let [s, e] = part.split("-").map(n => parseInt(n));
      if (isNaN(s) || isNaN(e)) return;
      s = Math.max(1, s);
      e = Math.min(max, e);
      for (let i = s; i <= e; i++) set.add(i - 1); 
    } else {
      const p = parseInt(part);
      if (!isNaN(p) && p >= 1 && p <= max) set.add(p - 1);
    }
    if (set.size > 0) groups.push([...set].sort((a, b) => a - b));
  });

  return groups;
}
    // Page range parser (1-3,5)
    // function parsePageRange(input, max) {
    //   if (!input) return [];
    //   const set = new Set();

    //   input.split(",").forEach(part => {
    //     if (part.includes("-")) {
    //       let [s, e] = part.split("-").map(n => parseInt(n));
    //       if (isNaN(s) || isNaN(e)) return;
    //       s = Math.max(1, s);
    //       e = Math.min(max, e);
    //       for (let i = s; i <= e; i++) set.add(i - 1);
    //     } else {
    //       const p = parseInt(part);
    //       if (!isNaN(p) && p >= 1 && p <= max) set.add(p - 1);
    //     }
    //   });

    //   return [...set].sort((a, b) => a - b);
    // }

// /* ================= Auto Orient File Function ================= */

// const autoOrientBtn = document.getElementById('autoOrientBtn');
// const autoOrientModal = document.getElementById('autoOrientModal');
// const closeAutoOrientModal = document.getElementById('closeAutoOrientModal');

// const autoOrientInput = document.getElementById('autoOrientFileInput');
// const autoOrientViewer = document.getElementById('autoOrientPdfViewer');
// const autoOrientLoader = document.getElementById('autoOrientLoader');
// const startAutoOrientBtn = document.getElementById('startAutoOrientBtn');

// let autoOrientFile = null;

// /* ================= OPEN MODAL ================= */
// autoOrientBtn.addEventListener('click', () => {
//   autoOrientModal.classList.remove('hidden');
// });

// /* ================= CLOSE MODAL ================= */
// closeAutoOrientModal.addEventListener('click', () => {
//   resetAutoOrientModal();
// });

// /* ================= FILE UPLOAD (1 PDF ONLY) ================= */
// autoOrientInput.addEventListener('change', () => {
//   const file = autoOrientInput.files[0];
//   if (!file || file.type !== 'application/pdf') {
//     alert('Please upload a valid PDF file.');
//     return;
//   }

//   autoOrientFile = file;
//   autoOrientViewer.src = URL.createObjectURL(file);
// });

// /* ================= START AUTO ORIENT ================= */
// startAutoOrientBtn.addEventListener('click', async () => {
//   if (!autoOrientFile) {
//     alert('Please upload a PDF file first.');
//     return;
//   }

//   autoOrientLoader.classList.remove('hidden');
//   autoOrientModal.classList.add('processing');

//   try {
//     // ⏳ PLACEHOLDER (next step: real orientation logic)
//     await new Promise(resolve => setTimeout(resolve, 2000));

//     alert('Auto orientation complete! (logic ready)');
//   } catch (err) {
//     console.error(err);
//     alert('Failed to auto-orient PDF.');
//   } finally {
//     autoOrientLoader.classList.add('hidden');
//     autoOrientModal.classList.remove('processing');
//   }
// });

/* ================= RESET ================= */
function resetAutoOrientModal() {
  autoOrientModal.classList.add('hidden');
  autoOrientInput.value = '';
  autoOrientViewer.src = '';
  autoOrientFile = null;
  autoOrientLoader.classList.add('hidden');
}



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
                
                document.getElementById('renameModal').classList.add("hidden");
                setTimeout(() => document.getElementById('renameBtn').click(), 100);
            }
        });

        div.querySelector('input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('confirmDownload').click();
            }
        });
    });

    modal.classList.remove("hidden");
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
        saveAs(content, `${uploadedFolderName}.zip`); // ⭐ Use the dynamic folder name here
        
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
    if (e.target === modal) document.getElementById('renameModal').classList.add("hidden");
});

// Initialize
updateFileCounter();

   // ==========================================
// AUTO ORIENT LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    
    // The main purple button on your dashboard that opens the modal
    // IMPORTANT: Make sure the ID below matches your actual purple button's ID in your HTML!
    const openModalBtn = document.getElementById('autoOrientBtn');
    const dropZone = document.getElementById('autoOrientDropZone');
    const dropText = document.getElementById('autoOrientDropText');
    
    // Modal Elements
    const autoOrientModal = document.getElementById('autoOrientModal');
    const closeAutoOrientModal = document.getElementById('closeAutoOrientModal');
    
    // Inside the Modal
    const orientFileInput = document.getElementById('autoOrientFileInput');
    const orientPdfViewer = document.getElementById('autoOrientPdfViewer');
    const orientLoader = document.getElementById('autoOrientLoader');
    const startOrientBtn = document.getElementById('startAutoOrientBtn'); 

    let currentOrientFile = null;

    // --- 1. Open / Close Modal Logic ---

    // Open modal when purple button is clicked
    if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
            autoOrientModal.classList.remove('hidden');
        });
    }

    // Close modal when 'x' is clicked
    if (closeAutoOrientModal) {
        closeAutoOrientModal.addEventListener('click', () => {
            autoOrientModal.classList.add('hidden');
            // Optional: clear the viewer and input when closing
            orientFileInput.value = '';
            orientPdfViewer.src = '';
            currentOrientFile = null;
        });
    }

    // Close modal if user clicks outside the white box
    window.addEventListener('click', (event) => {
        if (event.target === autoOrientModal) {
            autoOrientModal.classList.add('hidden');
        }
    });

    // --- 2. File Upload & Preview ---

    if (orientFileInput) {
        orientFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                currentOrientFile = file;
                
                // Create a temporary URL to preview the selected file
                const fileURL = URL.createObjectURL(file);
                orientPdfViewer.src = fileURL;
            }
        });
    }

    // --- 3. Process and Flip the PDF ---

    if (startOrientBtn) {
        startOrientBtn.addEventListener('click', async () => {
            if (!currentOrientFile) {
                alert('Please upload a PDF file first.');
                return;
            }

            // Show the loader and disable the button
            orientLoader.classList.remove('hidden');
            startOrientBtn.disabled = true;
            startOrientBtn.innerText = "Processing...";

            try {
                // Read the file into memory
                const arrayBuffer = await currentOrientFile.arrayBuffer();
                
                // Load the PDF into pdf-lib
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
                
                // Grab the rotation degree from the dropdown
                const rotationValue = parseInt(document.getElementById('orientDegree').value);

                // Get all pages and apply the selected rotation
                const pages = pdfDoc.getPages();
                pages.forEach((page) => {
                    const currentRotation = page.getRotation().angle;
                    page.setRotation(PDFLib.degrees(currentRotation + rotationValue));
                });
                
                // Save the rotated PDF back to raw bytes
                const pdfBytes = await pdfDoc.save();
                
                // Convert the bytes back into a PDF Blob
                const orientedBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                
                // Update the iframe to show the fixed document
                const newPdfUrl = URL.createObjectURL(orientedBlob);
                orientPdfViewer.src = newPdfUrl;

                // Trigger automatic download
                const downloadLink = document.createElement('a');
                downloadLink.href = newPdfUrl;
                downloadLink.download = `Oriented_${currentOrientFile.name}`;
                downloadLink.click();

                // Update current file so it can be flipped again if needed
                currentOrientFile = new File([orientedBlob], currentOrientFile.name, { type: 'application/pdf' });

                alert('Success! File oriented and downloaded.');

            } catch (error) {
                console.error('Error orienting PDF:', error);
                alert('An error occurred while orienting the file. Check the console for details.');
            } finally {
                // Hide loader and reset button
                orientLoader.classList.add('hidden');
                startOrientBtn.disabled = false;
                startOrientBtn.innerText = "Auto Orient PDF";
            }
        });
    }
});