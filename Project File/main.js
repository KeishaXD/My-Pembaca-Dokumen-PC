const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "KeiYomi",
        icon: path.join(__dirname, 'assets', 'logo.svg'),
        backgroundColor: '#1e1e1e', // Mencegah flash putih saat loading (Dark Mode)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark'; // Memaksa elemen native (menu, scrollbar, dll) jadi gelap
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Menangani permintaan pemilihan file dari index.html
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Documents', extensions: ['pdf', 'epub', 'cbz', 'zip', 'txt'] }
        ]
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

ipcMain.handle('dialog:openCover', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'jfif', 'ico'] }
        ]
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

// --- FITUR BARU: SAVE/LOAD DATA KE FILE TERSEMBUNYI ---
ipcMain.handle('data:save', async (event, data) => {
    const docPath = app.getPath('documents');
    const baseDir = path.join(docPath, 'KeiYomi');
    const filePath = path.join(baseDir, '.user_config.json'); // Nama file dengan awalan titik

    try {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        
        // Windows: Hapus atribut hidden dulu jika file sudah ada agar bisa ditimpa
        if (process.platform === 'win32' && fs.existsSync(filePath)) {
            try {
                execSync(`attrib -h "${filePath}"`);
            } catch (e) { /* Abaikan error jika gagal unhide */ }
        }

        // Simpan data ke file
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        // Windows: Set atribut hidden kembali
        if (process.platform === 'win32') {
            try {
                execSync(`attrib +h "${filePath}"`);
            } catch (e) { /* Abaikan error */ }
        }
        return true;
    } catch (error) {
        console.error("Gagal menyimpan data:", error);
        return false;
    }
});

ipcMain.handle('data:load', async () => {
    const docPath = app.getPath('documents');
    const filePath = path.join(docPath, 'KeiYomi', '.user_config.json');
    
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (error) {
        console.error("Gagal memuat data:", error);
    }
    return null;
});

// --- FITUR BARU: SCAN LIBRARY OTOMATIS ---
ipcMain.handle('library:scanLocal', async () => {
    const docPath = app.getPath('documents');
    const baseDir = path.join(docPath, 'KeiYomi');

    // 1. Buat folder jika belum ada
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }

    // --- FITUR BARU: Buat Contoh Folder Schema (Agar user paham formatnya) ---
    const examplePath = path.join(baseDir, 'Contoh Custom Folder');
    if (!fs.existsSync(examplePath)) {
        try {
            fs.mkdirSync(examplePath, { recursive: true });
            
            // 1. Siapkan Cover (Cari di assets: cover.jpg -> logo.svg -> dummy)
            const assetCover = path.join(__dirname, 'assets', 'cover.jpg');
            const assetLogo = path.join(__dirname, 'assets', 'logo.svg');
            let usedCoverName = 'cover.jpg';

            if (fs.existsSync(assetCover)) {
                fs.copyFileSync(assetCover, path.join(examplePath, 'cover.jpg'));
            } else if (fs.existsSync(assetLogo)) {
                usedCoverName = 'cover.svg';
                fs.copyFileSync(assetLogo, path.join(examplePath, 'cover.svg'));
            } else {
                fs.writeFileSync(path.join(examplePath, 'cover.jpg'), ''); // Fallback dummy
            }

            const infoContent = {
                title: "Guide Book",
                author: "Developer (KeishaXD)",
                cover: usedCoverName,
                genre: "Guide",
                synopsis: "(English) This is an example of a folder format. Place the info.json, cover.jpg, and book files (PDF/ZIP) in one folder to be detected automatically.\n\n (Indonesia) Ini adalah contoh format folder. Letakkan file info.json, cover.jpg, dan file buku (PDF/ZIP) di dalam satu folder agar terdeteksi otomatis.",
                type: "Artikel",
                date: "2024-06-01"
            };
            fs.writeFileSync(path.join(examplePath, 'info.json'), JSON.stringify(infoContent, null, 2));
            
            const panduanText = `CUSTOM FOLDER STRUCTURE GUIDE (ENGLISH)
=======================================

To allow the app to automatically detect books/comics, create a new folder inside "KeiYomi" with the following structure:

KeiYomi/
└── Your Book Title/           <-- Any Folder Name
    ├── info.json              <-- REQUIRED: Book identity file
    ├── cover.jpg              <-- OPTIONAL: Cover image (can be .png/.jpeg)
    ├── Chapter 1.pdf          <-- Book content file (Chapter 1)
    ├── Chapter 2.cbz          <-- Book content file (Chapter 2)
    └── Vol 3.zip              <-- Book content file (Chapter 3)

-------------------------------------------------------
EXAMPLE CONTENT OF info.json:
-------------------------------------------------------
{
  "title": "Cool Book Title",
  "author": "Author Name",
  "cover": "cover.jpg",
  "genre": "Action, Fantasy",
  "synopsis": "Write synopsis or story summary here...",
  "type": "Manga",
  "date": "2024-01-01"
}

Notes:
- Chapter files will be sorted automatically by filename.
- It is recommended to use numbering (01, 02, etc.) in chapter filenames.

=======================================================
=======================================================

PANDUAN STRUKTUR FOLDER CUSTOM (BAHASA INDONESIA)
=================================================

Agar aplikasi dapat mendeteksi buku/komik secara otomatis, buat folder baru di dalam "KeiYomi" dengan struktur berikut:

KeiYomi/
└── Judul Buku Anda/           <-- Nama Folder Bebas
    ├── info.json              <-- WAJIB: File identitas buku
    ├── cover.jpg              <-- OPSIONAL: Gambar sampul (bisa .png/.jpeg)
    ├── Chapter 1.pdf          <-- File isi buku (Chapter 1)
    ├── Chapter 2.cbz          <-- File isi buku (Chapter 2)
    └── Vol 3.zip              <-- File isi buku (Chapter 3)

-------------------------------------------------------
CONTOH ISI FILE info.json:
-------------------------------------------------------
{
  "title": "Judul Buku Keren",
  "author": "Nama Penulis",
  "cover": "cover.jpg",
  "genre": "Action, Fantasy",
  "synopsis": "Tulis sinopsis atau ringkasan cerita di sini...",
  "type": "Manga",
  "date": "2024-01-01"
}

Catatan:
- File chapter akan diurutkan otomatis berdasarkan nama file.
- Disarankan menggunakan penomoran (01, 02, dst) pada nama file chapter.`;

            fs.writeFileSync(path.join(examplePath, 'panduan.txt'), panduanText); // Panduan txt
        } catch (e) {
            console.error("Gagal membuat contoh folder:", e);
        }
    }

    const results = [];
    const supportedExts = ['.pdf', '.epub', '.cbz', '.zip', '.txt'];

    try {
        const items = fs.readdirSync(baseDir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(baseDir, item.name);

            // KASUS 1: File Langsungan (Simple)
            if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                if (supportedExts.includes(ext)) {
                    results.push({
                        structureType: 'simple',
                        title: item.name,
                        path: fullPath,
                        genre: 'Local File',
                        synopsis: 'File ditemukan otomatis di folder KeiYomi'
                    });
                }
            } 
            // KASUS 2: Folder Khusus (Structured/Manga)
            else if (item.isDirectory()) {
                const infoPath = path.join(fullPath, 'info.json');
                
                if (fs.existsSync(infoPath)) {
                    try {
                        // Baca info.json
                        const infoData = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                        
                        // --- LOGIKA BARU: Auto-detect Cover ---
                        let detectedCover = infoData.cover;
                        if (!detectedCover) {
                            const possibleCovers = [
                                'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'cover.gif', 'cover.avif',
                                'folder.jpg', 'folder.jpeg', 'folder.png', 'folder.webp',
                                'poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp'
                            ];
                            for (const img of possibleCovers) {
                                if (fs.existsSync(path.join(fullPath, img))) {
                                    detectedCover = img; // Gunakan nama file relatif
                                    break;
                                }
                            }
                        }

                        // Cari file chapter di dalam folder ini
                        const files = fs.readdirSync(fullPath)
                            .filter(f => supportedExts.includes(path.extname(f).toLowerCase()));
                        
                        // Sortir file agar urutan benar (1, 2, 10)
                        files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                        const chapterFiles = files.map((f, index) => ({
                            name: `Chapter ${index + 1}`,
                            path: path.join(fullPath, f)
                        }));

                        results.push({
                            structureType: 'series',
                            ...infoData, // Mengambil title, genre, synopsis dari json
                            cover: detectedCover, // Gunakan cover yang dideteksi
                            path: fullPath, // Path folder utama
                            chapters: chapterFiles // List file chapter
                        });
                    } catch (err) {
                        console.error("Error parsing info.json in " + item.name, err);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Gagal scan folder:", error);
    }

    return results;
});

// --- FITUR BARU: CHECK UPDATE (MAGISK STYLE) ---
ipcMain.handle('updater:check', async () => {
    try {
        // Baca package.json lokal untuk mendapatkan konfigurasi
        const packagePath = path.join(app.getAppPath(), 'package.json');
        const localInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

        if (!localInfo.updateJson) {
            return { error: 'URL updateJson tidak ditemukan di package.json' };
        }

        // Fetch update.json dari remote (GitHub)
        const response = await fetch(localInfo.updateJson);
        if (!response.ok) throw new Error(`Gagal akses update.json: ${response.status} ${response.statusText}. Pastikan file sudah di-upload ke GitHub.`);
        
        const remoteInfo = await response.json();
        const localCode = parseInt(localInfo.versionCode || 0);
        const remoteCode = parseInt(remoteInfo.versionCode || 0);

        return {
            updateAvailable: remoteCode > localCode,
            localInfo: { version: localInfo.version, versionCode: localCode },
            remoteInfo: remoteInfo
        };
    } catch (error) {
        console.error("Update check failed:", error);
        return { error: error.message };
    }
});

// --- FITUR BARU: KELUAR APLIKASI ---
ipcMain.on('app:quit', () => {
    app.quit();
});