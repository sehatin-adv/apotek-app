// _worker.js - API untuk Apotek Mendidoha Farma dengan D1
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace('/api/', '');
        const db = env.DB;

        // ============================================================
        // CORS HEADERS
        // ============================================================
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        try {
            // ============================================================
            // 1. OBAT
            // ============================================================
            if (path === 'obat' || path === 'master-obat') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare('SELECT * FROM obat ORDER BY id DESC').all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    if (Array.isArray(data)) {
                        // Bulk insert
                        const stmt = db.prepare(`
                            INSERT OR REPLACE INTO obat (id, kode_obat, nama_obat, satuan, harga_beli, harga_jual, jenis, golongan, stok, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = data.map(item => stmt.bind(
                            item.id || crypto.randomUUID(),
                            item.kode_obat,
                            item.nama_obat,
                            item.satuan || 'Tablet',
                            item.harga_beli || 0,
                            item.harga_jual || 0,
                            item.jenis || 'Generik',
                            item.golongan || 'Bebas',
                            item.stok || 0,
                            item.status || 'Aktif'
                        ));
                        await db.batch(batch);
                        return Response.json({ success: true, count: data.length }, { headers });
                    }

                    // Single insert
                    const result = await db.prepare(`
                        INSERT INTO obat (kode_obat, nama_obat, satuan, harga_beli, harga_jual, jenis, golongan, stok, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.kode_obat,
                        data.nama_obat,
                        data.satuan || 'Tablet',
                        data.harga_beli || 0,
                        data.harga_jual || 0,
                        data.jenis || 'Generik',
                        data.golongan || 'Bebas',
                        data.stok || 0,
                        data.status || 'Aktif'
                    ).run();
                    return Response.json({ success: true, id: result.meta.last_row_id }, { headers });
                }

                if (request.method === 'DELETE') {
                    const id = url.searchParams.get('id');
                    await db.prepare('DELETE FROM obat WHERE id = ?').bind(id).run();
                    return Response.json({ success: true }, { headers });
                }
            }

            // ============================================================
            // 2. SUPPLIER
            // ============================================================
            if (path === 'supplier' || path === 'master-supplier') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare('SELECT * FROM supplier ORDER BY id DESC').all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    if (Array.isArray(data)) {
                        const stmt = db.prepare(`
                            INSERT OR REPLACE INTO supplier (id, kode_supplier, nama_supplier, alamat, kota, telepon, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = data.map(item => stmt.bind(
                            item.id || crypto.randomUUID(),
                            item.kode_supplier,
                            item.nama_supplier,
                            item.alamat || '',
                            item.kota || '',
                            item.telepon || '',
                            item.status || 'Aktif'
                        ));
                        await db.batch(batch);
                        return Response.json({ success: true, count: data.length }, { headers });
                    }

                    await db.prepare(`
                        INSERT INTO supplier (kode_supplier, nama_supplier, alamat, kota, telepon, status)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.kode_supplier,
                        data.nama_supplier,
                        data.alamat || '',
                        data.kota || '',
                        data.telepon || '',
                        data.status || 'Aktif'
                    ).run();
                    return Response.json({ success: true }, { headers });
                }
            }

            // ============================================================
            // 3. APOTEKER
            // ============================================================
            if (path === 'apoteker' || path === 'master-apoteker') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare('SELECT * FROM apoteker ORDER BY id DESC').all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    if (Array.isArray(data)) {
                        const stmt = db.prepare(`
                            INSERT OR REPLACE INTO apoteker (id, nama, no_sik, no_stra, alamat, jabatan, tanggal_mulai, nik, id_satu_sehat, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = data.map(item => stmt.bind(
                            item.id || crypto.randomUUID(),
                            item.nama,
                            item.no_sik || '',
                            item.no_stra || '',
                            item.alamat || '',
                            item.jabatan || '',
                            item.tanggal_mulai || '',
                            item.nik || '',
                            item.id_satu_sehat || '',
                            item.status || 'Aktif'
                        ));
                        await db.batch(batch);
                        return Response.json({ success: true, count: data.length }, { headers });
                    }

                    await db.prepare(`
                        INSERT INTO apoteker (nama, no_sik, no_stra, alamat, jabatan, tanggal_mulai, nik, id_satu_sehat, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.nama,
                        data.no_sik || '',
                        data.no_stra || '',
                        data.alamat || '',
                        data.jabatan || '',
                        data.tanggal_mulai || '',
                        data.nik || '',
                        data.id_satu_sehat || '',
                        data.status || 'Aktif'
                    ).run();
                    return Response.json({ success: true }, { headers });
                }
            }

            // ============================================================
            // 4. PENJUALAN
            // ============================================================
            if (path === 'penjualan') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare(`
                        SELECT * FROM penjualan_header ORDER BY tanggal DESC, jam DESC LIMIT 50
                    `).all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    // Insert header
                    const headerResult = await db.prepare(`
                        INSERT INTO penjualan_header (no_faktur, tanggal, jam, shift, kasir, pelanggan, total, metode_pembayaran, cash, kembalian)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.no_faktur,
                        data.tanggal,
                        data.jam,
                        data.shift || '',
                        data.kasir || 'admin',
                        data.pelanggan || 'Umum',
                        data.total || 0,
                        data.metode_pembayaran || 'Cash',
                        data.cash || 0,
                        data.kembalian || 0
                    ).run();

                    const headerId = headerResult.meta.last_row_id;

                    // Insert details
                    if (data.items && data.items.length > 0) {
                        const stmt = db.prepare(`
                            INSERT INTO penjualan_detail (penjualan_id, obat_id, kode_obat, nama_obat, satuan, jumlah, harga_jual, subtotal)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = data.items.map(item => stmt.bind(
                            headerId,
                            item.obat_id || null,
                            item.kode_obat,
                            item.nama_obat,
                            item.satuan || 'Tablet',
                            item.jumlah || 1,
                            item.harga_jual || 0,
                            item.subtotal || 0
                        ));
                        await db.batch(batch);

                        // Update stok
                        for (const item of data.items) {
                            if (item.kode_obat) {
                                await db.prepare(`
                                    UPDATE obat SET stok = stok - ? WHERE kode_obat = ?
                                `).bind(item.jumlah, item.kode_obat).run();
                            }
                        }
                    }

                    return Response.json({ success: true, id: headerId }, { headers });
                }
            }

            // ============================================================
            // 5. RETUR PENJUALAN (dengan batas 3 hari)
            // ============================================================
            if (path === 'retur') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare(`
                        SELECT * FROM retur_penjualan ORDER BY tanggal_retur DESC
                    `).all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    // Cek batas retur 3 hari
                    const transaksi = await db.prepare(`
                        SELECT tanggal, jam, shift FROM penjualan_header WHERE no_faktur = ?
                    `).bind(data.no_faktur).first();

                    if (!transaksi) {
                        return Response.json({ error: 'Transaksi tidak ditemukan' }, { 
                            status: 404,
                            headers 
                        });
                    }

                    const tglTransaksi = new Date(transaksi.tanggal);
                    const tglRetur = new Date(data.tanggal_retur);
                    const selisihHari = Math.floor((tglRetur - tglTransaksi) / (1000 * 60 * 60 * 24));

                    if (selisihHari > 3) {
                        return Response.json({
                            error: 'Retur tidak dapat dilakukan karena transaksi sudah melewati batas waktu retur maksimal 3 hari.'
                        }, { status: 400, headers });
                    }

                    // Insert retur
                    const returResult = await db.prepare(`
                        INSERT INTO retur_penjualan (no_faktur, tanggal_retur, jam_retur, shift_retur, shift_asal, tanggal_asal, jam_asal, pelanggan, total_retur)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.no_faktur,
                        data.tanggal_retur,
                        data.jam_retur,
                        data.shift_retur || '',
                        transaksi.shift || '',
                        transaksi.tanggal || '',
                        transaksi.jam || '',
                        data.pelanggan || 'Umum',
                        data.total_retur || 0
                    ).run();

                    const returId = returResult.meta.last_row_id;

                    // Insert detail retur
                    if (data.items && data.items.length > 0) {
                        const stmt = db.prepare(`
                            INSERT INTO retur_detail (retur_id, obat_id, kode_obat, nama_obat, satuan, harga_jual, jumlah_retur, subtotal_retur)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = data.items.map(item => stmt.bind(
                            returId,
                            item.obat_id || null,
                            item.kode_obat,
                            item.nama_obat,
                            item.satuan || 'Tablet',
                            item.harga_jual || 0,
                            item.jumlah_retur || 0,
                            item.subtotal_retur || 0
                        ));
                        await db.batch(batch);

                        // Update stok (tambah kembali)
                        for (const item of data.items) {
                            if (item.kode_obat) {
                                await db.prepare(`
                                    UPDATE obat SET stok = stok + ? WHERE kode_obat = ?
                                `).bind(item.jumlah_retur, item.kode_obat).run();
                            }
                        }
                    }

                    return Response.json({ success: true, id: returId }, { headers });
                }
            }

            // ============================================================
            // 6. KARTU STOK (ONLINE)
            // ============================================================
            if (path === 'kartu-stok') {
                if (request.method === 'GET') {
                    const obatId = url.searchParams.get('obat_id');
                    const tglAwal = url.searchParams.get('tgl_awal');
                    const tglAkhir = url.searchParams.get('tgl_akhir');

                    let query = db.prepare(`
                        SELECT * FROM kartu_stok 
                        WHERE obat_id = ?
                        AND tanggal >= ? AND tanggal <= ?
                        ORDER BY tanggal, jam
                    `).bind(obatId, tglAwal, tglAkhir);

                    const { results } = await query.all();
                    return Response.json(results, { headers });
                }
            }

            // ============================================================
            // 7. SHIFT
            // ============================================================
            if (path === 'shift') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare(`
                        SELECT * FROM shift_history ORDER BY id DESC
                    `).all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    if (data.action === 'buka') {
                        const result = await db.prepare(`
                            INSERT INTO shift_history (shift, tanggal, user, saldo_awal, status, waktu_buka)
                            VALUES (?, ?, ?, ?, 'Buka', ?)
                        `).bind(
                            data.shift,
                            data.tanggal,
                            data.user || 'admin',
                            data.saldo_awal || 0,
                            new Date().toISOString()
                        ).run();
                        return Response.json({ success: true, id: result.meta.last_row_id }, { headers });
                    }

                    if (data.action === 'tutup') {
                        // Hitung total penjualan shift ini
                        const shiftData = await db.prepare(`
                            SELECT 
                                COALESCE(SUM(total), 0) as total_penjualan,
                                COALESCE(SUM(CASE WHEN metode_pembayaran = 'Cash' THEN total ELSE 0 END), 0) as total_cash,
                                COALESCE(SUM(CASE WHEN metode_pembayaran = 'Transfer' THEN total ELSE 0 END), 0) as total_transfer
                            FROM penjualan_header
                            WHERE shift = ? AND tanggal = ? AND (closed_shift_id IS NULL OR closed_shift_id = '')
                        `).bind(data.shift, data.tanggal).first();

                        // Hitung retur
                        const returData = await db.prepare(`
                            SELECT COALESCE(SUM(total_retur), 0) as total_retur
                            FROM retur_penjualan
                            WHERE shift_retur = ? AND tanggal_retur = ? AND (closed_shift_id IS NULL OR closed_shift_id = '')
                        `).bind(data.shift, data.tanggal).first();

                        const totalPenjualan = shiftData?.total_penjualan || 0;
                        const totalCash = shiftData?.total_cash || 0;
                        const totalTransfer = shiftData?.total_transfer || 0;
                        const totalRetur = returData?.total_retur || 0;

                        // Update shift
                        await db.prepare(`
                            UPDATE shift_history 
                            SET status = 'Tutup',
                                saldo_akhir = ?,
                                total_penjualan = ?,
                                total_cash = ?,
                                total_transfer = ?,
                                total_retur = ?,
                                diserahkan_kepada = ?,
                                catatan = ?,
                                waktu_tutup = ?
                            WHERE id = ?
                        `).bind(
                            data.saldo_akhir || 0,
                            totalPenjualan,
                            totalCash,
                            totalTransfer,
                            totalRetur,
                            data.diserahkan_kepada || '',
                            data.catatan || '',
                            new Date().toISOString(),
                            data.id
                        ).run();

                        // Tandai transaksi sudah ditutup
                        await db.prepare(`
                            UPDATE penjualan_header SET closed_shift_id = ? 
                            WHERE shift = ? AND tanggal = ? AND (closed_shift_id IS NULL OR closed_shift_id = '')
                        `).bind(data.id, data.shift, data.tanggal).run();

                        await db.prepare(`
                            UPDATE retur_penjualan SET closed_shift_id = ? 
                            WHERE shift_retur = ? AND tanggal_retur = ? AND (closed_shift_id IS NULL OR closed_shift_id = '')
                        `).bind(data.id, data.shift, data.tanggal).run();

                        return Response.json({ success: true }, { headers });
                    }
                }
            }

            // ============================================================
            // 8. STOK OPNAME
            // ============================================================
            if (path === 'stok-opname') {
                if (request.method === 'GET') {
                    const { results } = await db.prepare(`
                        SELECT * FROM stok_opname ORDER BY id DESC
                    `).all();
                    return Response.json(results, { headers });
                }

                if (request.method === 'POST') {
                    const data = await request.json();

                    const result = await db.prepare(`
                        INSERT INTO stok_opname (obat_id, snapshot_stok, stok_sistem, stok_fisik, selisih, tanggal, jam, keterangan)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        data.obat_id,
                        data.snapshot_stok || 0,
                        data.stok_sistem || 0,
                        data.stok_fisik || 0,
                        data.selisih || 0,
                        data.tanggal,
                        data.jam,
                        data.keterangan || ''
                    ).run();

                    return Response.json({ success: true, id: result.meta.last_row_id }, { headers });
                }
            }

            // ============================================================
            // 9. LAPORAN HARIAN (dengan filter tanggal & jam)
            // ============================================================
            if (path === 'laporan-harian') {
                const tglAwal = url.searchParams.get('tgl_awal');
                const tglAkhir = url.searchParams.get('tgl_akhir');

                if (!tglAwal || !tglAkhir) {
                    return Response.json({ error: 'Parameter tgl_awal dan tgl_akhir wajib diisi' }, { 
                        status: 400,
                        headers 
                    });
                }

                const { results } = await db.prepare(`
                    SELECT 
                        ph.*,
                        (SELECT COALESCE(SUM(total_retur), 0) FROM retur_penjualan WHERE no_faktur = ph.no_faktur) as total_retur
                    FROM penjualan_header ph
                    WHERE ph.tanggal >= ? AND ph.tanggal <= ?
                    ORDER BY ph.tanggal DESC, ph.jam DESC
                `).bind(tglAwal, tglAkhir).all();

                return Response.json(results, { headers });
            }

            // ============================================================
            // 10. LAPORAN LABA RUGI (Bulanan)
            // ============================================================
            if (path === 'laporan-laba-rugi') {
                const bulan = url.searchParams.get('bulan');
                const tahun = url.searchParams.get('tahun');

                if (!bulan || !tahun) {
                    return Response.json({ error: 'Parameter bulan dan tahun wajib diisi' }, { 
                        status: 400,
                        headers 
                    });
                }

                const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
                const lastDay = new Date(parseInt(tahun), parseInt(bulan), 0).getDate();
                const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

                // Total penjualan
                const penjualan = await db.prepare(`
                    SELECT COALESCE(SUM(total), 0) as total 
                    FROM penjualan_header 
                    WHERE tanggal >= ? AND tanggal <= ?
                `).bind(startDate, endDate).first();

                // Total retur
                const retur = await db.prepare(`
                    SELECT COALESCE(SUM(total_retur), 0) as total 
                    FROM retur_penjualan 
                    WHERE tanggal_retur >= ? AND tanggal_retur <= ?
                `).bind(startDate, endDate).first();

                // HPP dari detail penjualan
                const hppResult = await db.prepare(`
                    SELECT COALESCE(SUM(pd.jumlah * o.harga_beli), 0) as total_hpp
                    FROM penjualan_detail pd
                    JOIN obat o ON pd.obat_id = o.id
                    JOIN penjualan_header ph ON pd.penjualan_id = ph.id
                    WHERE ph.tanggal >= ? AND ph.tanggal <= ?
                `).bind(startDate, endDate).first();

                const totalPenjualan = penjualan?.total || 0;
                const totalRetur = retur?.total || 0;
                const totalHPP = hppResult?.total_hpp || 0;
                const penjualanBersih = totalPenjualan - totalRetur;
                const labaKotor = penjualanBersih - totalHPP;

                return Response.json({
                    total_penjualan: totalPenjualan,
                    total_retur: totalRetur,
                    penjualan_bersih: penjualanBersih,
                    total_hpp: totalHPP,
                    laba_kotor: labaKotor,
                    biaya_operasional: 0,
                    laba_bersih: labaKotor
                }, { headers });
            }

            // ============================================================
            // 11. LAPORAN PENJUALAN PER OBAT
            // ============================================================
            if (path === 'laporan-obat') {
                const obatId = url.searchParams.get('obat_id');
                const tglAwal = url.searchParams.get('tgl_awal');
                const tglAkhir = url.searchParams.get('tgl_akhir');

                if (!obatId) {
                    return Response.json({ error: 'Parameter obat_id wajib diisi' }, { 
                        status: 400,
                        headers 
                    });
                }

                let query = db.prepare(`
                    SELECT 
                        pd.*,
                        ph.no_faktur,
                        ph.tanggal,
                        ph.jam,
                        ph.shift,
                        ph.kasir,
                        ph.pelanggan,
                        ph.metode_pembayaran
                    FROM penjualan_detail pd
                    JOIN penjualan_header ph ON pd.penjualan_id = ph.id
                    WHERE pd.obat_id = ?
                `).bind(obatId);

                if (tglAwal && tglAkhir) {
                    query = db.prepare(`
                        SELECT 
                            pd.*,
                            ph.no_faktur,
                            ph.tanggal,
                            ph.jam,
                            ph.shift,
                            ph.kasir,
                            ph.pelanggan,
                            ph.metode_pembayaran
                        FROM penjualan_detail pd
                        JOIN penjualan_header ph ON pd.penjualan_id = ph.id
                        WHERE pd.obat_id = ?
                        AND ph.tanggal >= ? AND ph.tanggal <= ?
                        ORDER BY ph.tanggal DESC, ph.jam DESC
                    `).bind(obatId, tglAwal, tglAkhir);
                } else {
                    query = db.prepare(`
                        SELECT 
                            pd.*,
                            ph.no_faktur,
                            ph.tanggal,
                            ph.jam,
                            ph.shift,
                            ph.kasir,
                            ph.pelanggan,
                            ph.metode_pembayaran
                        FROM penjualan_detail pd
                        JOIN penjualan_header ph ON pd.penjualan_id = ph.id
                        WHERE pd.obat_id = ?
                        ORDER BY ph.tanggal DESC, ph.jam DESC
                    `).bind(obatId);
                }

                const { results } = await query.all();
                return Response.json(results, { headers });
            }

            // ============================================================
            // 12. MIGRASI DATA DARI LOCALSTORAGE KE D1
            // ============================================================
            if (path === 'migrasi') {
                if (request.method === 'POST') {
                    const data = await request.json();
                    const { type, records } = data;

                    if (type === 'obat') {
                        const stmt = db.prepare(`
                            INSERT OR REPLACE INTO obat (id, kode_obat, nama_obat, satuan, harga_beli, harga_jual, jenis, golongan, stok, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        const batch = records.map(item => stmt.bind(
                            item.id || crypto.randomUUID(),
                            item.kode_obat,
                            item.nama_obat,
                            item.satuan || 'Tablet',
                            item.harga_beli || 0,
                            item.harga_jual || 0,
                            item.jenis || 'Generik',
                            item.golongan || 'Bebas',
                            item.stok || 0,
                            item.status || 'Aktif'
                        ));
                        await db.batch(batch);
                        return Response.json({ success: true, count: records.length }, { headers });
                    }

                    if (type === 'penjualan') {
                        for (const p of records) {
                            // Insert header
                            const headerResult = await db.prepare(`
                                INSERT INTO penjualan_header (no_faktur, tanggal, jam, shift, kasir, pelanggan, total, metode_pembayaran, cash, kembalian)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).bind(
                                p.no_faktur,
                                p.tanggal,
                                p.jam || '00:00',
                                p.shift || '',
                                p.kasir || 'admin',
                                p.pelanggan || 'Umum',
                                p.total || 0,
                                p.metode_pembayaran || 'Cash',
                                p.cash || 0,
                                p.kembalian || 0
                            ).run();

                            const headerId = headerResult.meta.last_row_id;

                            // Insert details
                            if (p.items && p.items.length > 0) {
                                const stmt = db.prepare(`
                                    INSERT INTO penjualan_detail (penjualan_id, obat_id, kode_obat, nama_obat, satuan, jumlah, harga_jual, subtotal)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                const batch = p.items.map(item => stmt.bind(
                                    headerId,
                                    item.obat_id || null,
                                    item.kode_obat,
                                    item.nama_obat,
                                    item.satuan || 'Tablet',
                                    item.jumlah || 1,
                                    item.harga_jual || 0,
                                    item.subtotal || 0
                                ));
                                await db.batch(batch);
                            }
                        }
                        return Response.json({ success: true, count: records.length }, { headers });
                    }

                    if (type === 'retur') {
                        for (const r of records) {
                            const returResult = await db.prepare(`
                                INSERT INTO retur_penjualan (no_faktur, tanggal_retur, jam_retur, shift_retur, shift_asal, tanggal_asal, jam_asal, pelanggan, total_retur)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).bind(
                                r.no_faktur,
                                r.tanggal_retur,
                                r.jam_retur || '00:00',
                                r.shift_retur || '',
                                r.shift_asal || '',
                                r.tanggal_asal || '',
                                r.jam_asal || '',
                                r.pelanggan || 'Umum',
                                r.total_retur || 0
                            ).run();

                            const returId = returResult.meta.last_row_id;

                            if (r.items && r.items.length > 0) {
                                const stmt = db.prepare(`
                                    INSERT INTO retur_detail (retur_id, obat_id, kode_obat, nama_obat, satuan, harga_jual, jumlah_retur, subtotal_retur)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                const batch = r.items.map(item => stmt.bind(
                                    returId,
                                    item.obat_id || null,
                                    item.kode_obat,
                                    item.nama_obat,
                                    item.satuan || 'Tablet',
                                    item.harga_jual || 0,
                                    item.jumlah_retur || 0,
                                    item.subtotal_retur || 0
                                ));
                                await db.batch(batch);
                            }
                        }
                        return Response.json({ success: true, count: records.length }, { headers });
                    }

                    return Response.json({ error: 'Tipe migrasi tidak dikenal' }, { status: 400, headers });
                }
            }

            // ============================================================
            // DEFAULT
            // ============================================================
            return Response.json({
                success: true,
                message: 'API Apotek Mendidoha Farma (D1)',
                endpoints: [
                    'obat', 'supplier', 'apoteker',
                    'penjualan', 'retur',
                    'kartu-stok', 'shift', 'stok-opname',
                    'laporan-harian', 'laporan-laba-rugi', 'laporan-obat',
                    'migrasi'
                ]
            }, { headers });

        } catch (error) {
            return Response.json({
                error: error.message,
                stack: error.stack
            }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};