export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');
    
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
        const db = env.DB;
        
        // CEK: Apakah DB tersedia?
        if (!db) {
            return new Response(JSON.stringify({ 
                error: 'Database tidak terhubung. Pastikan binding DB sudah diatur di wrangler.toml' 
            }), { status: 500, headers });
        }
        
        // ============================================================
        // PEMBELIAN - POST (Simpan Pembelian)
        // ============================================================
        if (path === 'pembelian') {
            if (request.method === 'GET') {
                const result = await db.prepare(`
                    SELECT ph.*, s.nama_supplier 
                    FROM pembelian_header ph 
                    LEFT JOIN supplier s ON ph.supplier_id = s.id 
                    ORDER BY ph.id DESC
                `).all();
                return new Response(JSON.stringify(result.results || []), { headers });
            }
            
            if (request.method === 'POST') {
                const data = await request.json();
                console.log('Data pembelian diterima:', data);
                
                // Validasi
                if (!data.no_faktur) {
                    return new Response(JSON.stringify({ 
                        success: false, 
                        message: 'No. Faktur wajib diisi!' 
                    }), { status: 400, headers });
                }
                
                // Simpan ke header pembelian
                const result = await db.prepare(`
                    INSERT INTO pembelian_header (
                        no_faktur, 
                        tanggal_faktur, 
                        supplier_id, 
                        gudang, 
                        jenis, 
                        kas, 
                        no_faktur_pajak,
                        total, 
                        diskon,
                        pajak,
                        keterangan
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    data.no_faktur,
                    data.tanggal_faktur || new Date().toISOString().split('T')[0],
                    data.supplier_id || null,
                    data.gudang || 'GUDANG UTAMA',
                    data.jenis || 'TUNAI',
                    data.kas || 'Kas Umum',
                    data.no_faktur_pajak || '',
                    data.total || 0,
                    data.diskon || 0,
                    data.ppn_persen || 11,
                    data.keterangan || ''
                ).run();
                
                const headerId = result.meta.last_row_id;
                
                // Simpan detail pembelian
                if (data.items && data.items.length > 0) {
                    for (const item of data.items) {
                        // Cari obat_id dari kode_obat
                        let obatId = null;
                        if (item.kode_obat) {
                            const obatResult = await db.prepare(
                                'SELECT id FROM obat WHERE kode_obat = ?'
                            ).bind(item.kode_obat).first();
                            if (obatResult) {
                                obatId = obatResult.id;
                            }
                        }
                        
                        await db.prepare(`
                            INSERT INTO pembelian_detail (
                                pembelian_id,
                                obat_id,
                                jumlah,
                                satuan,
                                harga_beli,
                                subtotal,
                                diskon_persen,
                                diskon_nominal,
                                hpp,
                                margin_jual,
                                harga_jual1,
                                diskon_jual1,
                                tanggal_exp,
                                no_batch,
                                ketentuan_retur
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            headerId,
                            obatId || null,
                            item.jumlah || 0,
                            item.satuan || '',
                            item.harga_beli || 0,
                            item.subtotal || 0,
                            item.diskon_persen || 0,
                            item.diskon_nominal || 0,
                            item.hpp || 0,
                            item.margin_persen || 0,
                            item.harga_jual || 0,
                            item.diskon_jual_persen || 0,
                            item.tanggal_exp || '',
                            item.no_batch || '',
                            item.ketentuan_retur || ''
                        ).run();
                    }
                }
                
                return new Response(JSON.stringify({ 
                    success: true, 
                    message: 'Pembelian berhasil disimpan!',
                    id: headerId,
                    no_faktur: data.no_faktur
                }), { headers });
            }
        }
        
        // ============================================================
        // OBAT
        // ============================================================
        if (path === 'obat') {
            if (request.method === 'GET') {
                const result = await db.prepare('SELECT * FROM obat ORDER BY id DESC').all();
                return new Response(JSON.stringify(result.results || []), { headers });
            }
            if (request.method === 'POST') {
                const data = await request.json();
                if (Array.isArray(data)) {
                    for (const item of data) {
                        await db.prepare(`
                            INSERT OR REPLACE INTO obat (id, kode_obat, nama_obat, satuan, harga_beli, harga_jual, jenis, golongan, stok, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            item.id || null,
                            item.kode_obat,
                            item.nama_obat,
                            item.satuan || 'Tablet',
                            item.harga_beli || 0,
                            item.harga_jual || 0,
                            item.jenis || 'Generik',
                            item.golongan || 'Bebas',
                            item.stok || 0,
                            item.status || 'Aktif'
                        ).run();
                    }
                    return new Response(JSON.stringify({ 
                        success: true, 
                        message: `${data.length} data obat disimpan` 
                    }), { headers });
                }
                await db.prepare(`
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
                return new Response(JSON.stringify({ success: true }), { headers });
            }
        }
        
        // ============================================================
        // SUPPLIER
        // ============================================================
        if (path === 'supplier') {
            if (request.method === 'GET') {
                const result = await db.prepare('SELECT * FROM supplier ORDER BY id DESC').all();
                return new Response(JSON.stringify(result.results || []), { headers });
            }
            if (request.method === 'POST') {
                const data = await request.json();
                if (Array.isArray(data)) {
                    for (const item of data) {
                        await db.prepare(`
                            INSERT OR REPLACE INTO supplier (id, kode_supplier, nama_supplier, alamat, kota, telepon, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            item.id || null,
                            item.kode_supplier,
                            item.nama_supplier,
                            item.alamat || '',
                            item.kota || '',
                            item.telepon || '',
                            item.status || 'Aktif'
                        ).run();
                    }
                    return new Response(JSON.stringify({ 
                        success: true, 
                        message: `${data.length} supplier disimpan` 
                    }), { headers });
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
                return new Response(JSON.stringify({ success: true }), { headers });
            }
        }
        
        // ============================================================
        // DEFAULT RESPONSE
        // ============================================================
        return new Response(JSON.stringify({
            success: true,
            message: 'API Apotek Mendidoha Farma',
            endpoints: ['obat', 'supplier', 'apoteker', 'pembelian', 'penjualan', 'shift', 'stok-opname']
        }), { headers });
        
    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message,
            stack: error.stack 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}