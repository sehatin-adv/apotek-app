// src/database.js
import { supabase } from './supabase.js';
import { supabaseAdmin, adminCreateUser } from './supabase.js';

// ============================================================
// OBAT
// ============================================================
export async function getObat() {
    try {
        const { data, error } = await supabase
            .from('obat')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getObat:', e);
        const local = localStorage.getItem('obat');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function getObatById(id) {
    try {
        const { data, error } = await supabase
            .from('obat')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getObatById:', e);
        return { data: null, error: e };
    }
}

export async function saveObat(obatData) {
    try {
        const { data, error } = await supabase
            .from('obat')
            .upsert(obatData, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error saveObat:', e);
        return { data: null, error: e };
    }
}

export async function deleteObat(id) {
    try {
        const { error } = await supabase
            .from('obat')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return { error: null };
    } catch(e) {
        console.error('Error deleteObat:', e);
        return { error: e };
    }
}

// ============================================================
// SUPPLIER
// ============================================================
export async function getSupplier() {
    try {
        const { data, error } = await supabase
            .from('supplier')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getSupplier:', e);
        const local = localStorage.getItem('supplier');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function saveSupplier(supplierData) {
    try {
        const { data, error } = await supabase
            .from('supplier')
            .upsert(supplierData, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error saveSupplier:', e);
        return { data: null, error: e };
    }
}

export async function deleteSupplier(id) {
    try {
        const { error } = await supabase
            .from('supplier')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return { error: null };
    } catch(e) {
        console.error('Error deleteSupplier:', e);
        return { error: e };
    }
}

// ============================================================
// APOTEKER
// ============================================================
export async function getApoteker() {
    try {
        const { data, error } = await supabase
            .from('apoteker')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getApoteker:', e);
        const local = localStorage.getItem('apoteker');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function saveApoteker(apotekerData) {
    try {
        const cleanData = {};
        Object.keys(apotekerData).forEach(key => {
            if (apotekerData[key] !== null && apotekerData[key] !== undefined && apotekerData[key] !== '') {
                cleanData[key] = apotekerData[key];
            }
        });
        const { data, error } = await supabase
            .from('apoteker')
            .upsert(cleanData, { onConflict: 'id' })
            .select();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error saveApoteker:', e);
        return { data: null, error: e };
    }
}

export async function deleteApoteker(id) {
    try {
        const { error } = await supabase
            .from('apoteker')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return { error: null };
    } catch(e) {
        console.error('Error deleteApoteker:', e);
        return { error: e };
    }
}

// ============================================================
// PENJUALAN - DENGAN SHIFT_ID
// ============================================================
export async function getPenjualan(tanggalMulai, tanggalAkhir) {
    try {
        let query = supabase
            .from('penjualan_header')
            .select('*')
            .order('tanggal', { ascending: false })
            .order('jam', { ascending: false });
        if (tanggalMulai && tanggalAkhir) {
            query = query.gte('tanggal', tanggalMulai).lte('tanggal', tanggalAkhir);
        }
        const { data, error } = await query;
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getPenjualan:', e);
        const local = localStorage.getItem('penjualan_history');
        if (local) {
            let data = JSON.parse(local);
            if (tanggalMulai && tanggalAkhir) {
                data = data.filter(p => p.tanggal >= tanggalMulai && p.tanggal <= tanggalAkhir);
            }
            return { data, error: null };
        }
        return { data: [], error: e };
    }
}

export async function getPenjualanByNoFaktur(noFaktur) {
    try {
        const { data, error } = await supabase
            .from('penjualan_header')
            .select('*, penjualan_detail(*)')
            .eq('no_faktur', noFaktur)
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getPenjualanByNoFaktur:', e);
        return { data: null, error: e };
    }
}

export async function savePenjualan(header, details) {
    try {
        // ============================================================
        // 1. AMBIL SHIFT AKTIF
        // ============================================================
        const { data: shiftAktif, error: shiftError } = await getShiftAktif();
        if (shiftError) throw shiftError;
        
        if (!shiftAktif) {
            return { 
                data: null, 
                error: { message: 'Shift belum dibuka! Silakan buka shift terlebih dahulu.' }
            };
        }

        // ============================================================
        // 2. CEK DUPLIKAT NO FAKTUR
        // ============================================================
        const { data: existing } = await supabase
            .from('penjualan_header')
            .select('id')
            .eq('no_faktur', header.no_faktur)
            .maybeSingle();
            
        if (existing) {
            console.warn('⚠️ No faktur sudah ada:', header.no_faktur);
            return { data: existing, error: null };
        }

        // ============================================================
        // 3. INSERT HEADER DENGAN SHIFT_ID
        // ============================================================
        const headerWithShift = {
            ...header,
            shift_id: shiftAktif.id
        };

        const { data: headerData, error: headerError } = await supabase
            .from('penjualan_header')
            .insert(headerWithShift)
            .select();

        if (headerError) throw headerError;

        // ============================================================
        // 4. INSERT DETAIL
        // ============================================================
        const detailsWithId = details.map(d => ({
            ...d,
            penjualan_id: headerData[0].id
        }));

        const { error: detailError } = await supabase
            .from('penjualan_detail')
            .insert(detailsWithId);

        if (detailError) throw detailError;

        // ============================================================
        // 5. UPDATE STOK & KARTU STOK
        // ============================================================
        for (const item of details) {
            if (item.kode_obat) {
                const { data: obatData, error: obatError } = await supabase
                    .from('obat')
                    .select('id, stok')
                    .eq('kode_obat', item.kode_obat)
                    .single();

                if (!obatError && obatData) {
                    const stokBaru = Math.max(0, (obatData.stok || 0) - (item.jumlah || 0));
                    await supabase
                        .from('obat')
                        .update({ stok: stokBaru })
                        .eq('id', obatData.id);
                    await supabase
                        .from('kartu_stok')
                        .insert({
                            obat_id: obatData.id,
                            kode_obat: item.kode_obat,
                            nama_obat: item.nama_obat || '',
                            tanggal: header.tanggal || new Date().toISOString().split('T')[0],
                            jam: header.jam || new Date().toTimeString().slice(0,5),
                            no_bukti: header.no_faktur || 'JUAL-' + Date.now(),
                            keterangan: 'Penjualan',
                            keluar: item.jumlah || 0,
                            sisa_stok: stokBaru
                        });
                }
            }
        }

        // ============================================================
        // 6. BACKUP KE LOCALSTORAGE
        // ============================================================
        const history = JSON.parse(localStorage.getItem('penjualan_history') || '[]');
        const data = { ...header, id: headerData[0].id, shift_id: shiftAktif.id, items: details };
        history.push(data);
        localStorage.setItem('penjualan_history', JSON.stringify(history));

        const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
        details.forEach(item => {
            const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
            if (obat) {
                obat.stok = Math.max(0, (obat.stok || 0) - (item.jumlah || 0));
            }
        });
        localStorage.setItem('obat', JSON.stringify(obatLocal));

        return { data: headerData[0], error: null };
    } catch(e) {
        console.error('Error savePenjualan:', e);
        return { data: null, error: e };
    }
}

// ============================================================
// RETUR PENJUALAN - DENGAN SHIFT_ID
// ============================================================
export async function getAllRetur() {
    try {
        const { data, error } = await supabase
            .from('retur_penjualan')
            .select('*, retur_detail(*)')
            .order('tanggal_retur', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getAllRetur:', e);
        const local = localStorage.getItem('retur_penjualan');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function getReturByNoFaktur(noFaktur) {
    try {
        const { data, error } = await supabase
            .from('retur_penjualan')
            .select('*, retur_detail(*)')
            .eq('no_faktur', noFaktur);
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getReturByNoFaktur:', e);
        return { data: null, error: e };
    }
}

export async function saveRetur(returData, detailRetur) {
    try {
        // ============================================================
        // 1. AMBIL SHIFT AKTIF
        // ============================================================
        const { data: shiftAktif, error: shiftError } = await getShiftAktif();
        if (shiftError) throw shiftError;
        
        if (!shiftAktif) {
            return { 
                data: null, 
                error: { message: 'Shift belum dibuka! Silakan buka shift terlebih dahulu.' }
            };
        }

        // ============================================================
        // 2. CEK BATAS RETUR 3 HARI
        // ============================================================
        const { data: transaksi, error: transError } = await supabase
            .from('penjualan_header')
            .select('tanggal, jam, shift')
            .eq('no_faktur', returData.no_faktur)
            .single();

        if (transError) throw transError;

        const tglTransaksi = new Date(transaksi.tanggal);
        const tglRetur = new Date(returData.tanggal_retur);
        const selisihHari = Math.floor((tglRetur - tglTransaksi) / (1000 * 60 * 60 * 24));

        if (selisihHari > 3) {
            return {
                data: null,
                error: {
                    message: 'Retur tidak dapat dilakukan karena transaksi sudah melewati batas waktu retur maksimal 3 hari.',
                    code: 'RETUR_EXPIRED'
                }
            };
        }

        // ============================================================
        // 3. INSERT RETUR DENGAN SHIFT_ID
        // ============================================================
        const returWithShift = {
            ...returData,
            shift_id: shiftAktif.id,
            shift_asal: transaksi.shift,
            tanggal_asal: transaksi.tanggal,
            jam_asal: transaksi.jam
        };

        const { data: returHeader, error: headerError } = await supabase
            .from('retur_penjualan')
            .insert(returWithShift)
            .select();

        if (headerError) throw headerError;

        // ============================================================
        // 4. INSERT DETAIL RETUR
        // ============================================================
        const detailsWithId = detailRetur.map(d => ({
            ...d,
            retur_id: returHeader[0].id
        }));

        const { error: detailError } = await supabase
            .from('retur_detail')
            .insert(detailsWithId);

        if (detailError) throw detailError;

        // ============================================================
        // 5. UPDATE STOK & KARTU STOK
        // ============================================================
        for (const item of detailRetur) {
            if (item.kode_obat) {
                const { data: obatData, error: obatError } = await supabase
                    .from('obat')
                    .select('id, stok')
                    .eq('kode_obat', item.kode_obat)
                    .single();

                if (!obatError && obatData) {
                    const stokBaru = (obatData.stok || 0) + (item.jumlah_retur || 0);
                    await supabase
                        .from('obat')
                        .update({ stok: stokBaru })
                        .eq('id', obatData.id);
                    await supabase
                        .from('kartu_stok')
                        .insert({
                            obat_id: obatData.id,
                            kode_obat: item.kode_obat,
                            nama_obat: item.nama_obat || '',
                            tanggal: returData.tanggal_retur || new Date().toISOString().split('T')[0],
                            jam: returData.jam_retur || new Date().toTimeString().slice(0,5),
                            no_bukti: 'RET-' + (returData.no_faktur || ''),
                            keterangan: 'Retur Penjualan',
                            masuk: item.jumlah_retur || 0,
                            sisa_stok: stokBaru
                        });
                }
            }
        }

        // ============================================================
        // 6. BACKUP KE LOCALSTORAGE
        // ============================================================
        const history = JSON.parse(localStorage.getItem('retur_penjualan') || '[]');
        history.push({ ...returData, id: returHeader[0].id, shift_id: shiftAktif.id, items: detailRetur });
        localStorage.setItem('retur_penjualan', JSON.stringify(history));

        const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
        detailRetur.forEach(item => {
            const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
            if (obat) {
                obat.stok = (obat.stok || 0) + (item.jumlah_retur || 0);
            }
        });
        localStorage.setItem('obat', JSON.stringify(obatLocal));

        return { data: returHeader[0], error: null };
    } catch(e) {
        console.error('Error saveRetur:', e);
        return { data: null, error: e };
    }
}

// ============================================================
// KARTU STOK
// ============================================================
export async function getKartuStok(obatId, tglAwal, tglAkhir) {
    try {
        let query = supabase
            .from('kartu_stok')
            .select('*')
            .eq('obat_id', obatId)
            .order('tanggal', { ascending: true })
            .order('jam', { ascending: true });
        if (tglAwal && tglAkhir) {
            query = query.gte('tanggal', tglAwal).lte('tanggal', tglAkhir);
        }
        const { data, error } = await query;
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getKartuStok:', e);
        return { data: [], error: e };
    }
}

// ============================================================
// SHIFT - DIPERBAIKI
// ============================================================
export async function getShiftAktif() {
    try {
        const { data, error } = await supabase
            .from('shift_history')
            .select('*')
            .eq('status', 'Buka')
            .order('waktu_buka', { ascending: false })
            .limit(1);

        if (error) throw error;
        
        if (!data || data.length === 0) {
            const local = localStorage.getItem('shift_aktif');
            if (local) {
                return { data: JSON.parse(local), error: null };
            }
            return { data: null, error: null };
        }

        localStorage.setItem('shift_aktif', JSON.stringify(data[0]));
        return { data: data[0], error: null };
    } catch(e) {
        console.error('Error getShiftAktif:', e);
        const local = localStorage.getItem('shift_aktif');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: null, error: e };
    }
}

export async function bukaShift(data) {
    try {
        // Cek apakah ada shift yang masih buka
        const { data: existing, error: checkError } = await supabase
            .from('shift_history')
            .select('id')
            .eq('status', 'Buka')
            .limit(1);

        if (checkError) throw checkError;
        
        if (existing && existing.length > 0) {
            return { 
                data: null, 
                error: { message: 'Masih ada shift yang aktif! Tutup shift terlebih dahulu.' }
            };
        }

        const now = new Date();
        const shiftData = {
            shift: data.shift,
            tanggal: data.tanggal || now.toISOString().split('T')[0],
            username: data.user,
            saldo_awal: data.saldo_awal || 0,
            saldo_akhir: 0,
            total_penjualan: 0,
            total_cash: 0,
            total_transfer: 0,
            total_retur: 0,
            status: 'Buka',
            waktu_buka: now.toISOString(),
            waktu_tutup: null
        };

        const { data: result, error } = await supabase
            .from('shift_history')
            .insert(shiftData)
            .select();

        if (error) throw error;

        const shiftResult = result && result.length > 0 ? result[0] : null;
        
        if (shiftResult) {
            localStorage.setItem('shift_aktif', JSON.stringify(shiftResult));
        }
        
        return { data: shiftResult, error: null };
    } catch(e) {
        console.error('Error bukaShift:', e);
        const fallbackData = { 
            ...data, 
            id: 'shift-' + Date.now(), 
            status: 'Buka', 
            waktu_buka: new Date().toISOString(),
            total_penjualan: 0,
            total_cash: 0,
            total_transfer: 0,
            total_retur: 0
        };
        localStorage.setItem('shift_aktif', JSON.stringify(fallbackData));
        return { data: fallbackData, error: null };
    }
}

export async function tutupShift(data) {
    try {
        // 1. Dapatkan shift yang akan ditutup
        const { data: shiftData, error: shiftError } = await supabase
            .from('shift_history')
            .select('*')
            .eq('id', data.id)
            .single();

        if (shiftError) throw shiftError;
        if (!shiftData) {
            return { data: null, error: { message: 'Shift tidak ditemukan' } };
        }

        // 2. Hitung transaksi yang TERKAIT DENGAN SHIFT INI (shift_id = data.id)
        const { data: penjualanData, error: penjualanError } = await supabase
            .from('penjualan_header')
            .select('total, metode_pembayaran')
            .eq('shift_id', data.id);

        if (penjualanError) throw penjualanError;

        let totalPenjualan = 0;
        let totalCash = 0;
        let totalTransfer = 0;

        if (penjualanData && penjualanData.length > 0) {
            penjualanData.forEach(p => {
                totalPenjualan += (p.total || 0);
                if (p.metode_pembayaran === 'Cash') {
                    totalCash += (p.total || 0);
                } else {
                    totalTransfer += (p.total || 0);
                }
            });
        }

        // 3. Hitung retur yang TERKAIT DENGAN SHIFT INI
        const { data: returData, error: returError } = await supabase
            .from('retur_penjualan')
            .select('total_retur')
            .eq('shift_id', data.id);

        if (returError) throw returError;

        let totalRetur = 0;
        if (returData && returData.length > 0) {
            returData.forEach(r => {
                totalRetur += (r.total_retur || 0);
            });
        }

        // 4. Hitung saldo akhir
        const saldoAkhir = (shiftData.saldo_awal || 0) + totalPenjualan - totalRetur;

        // 5. Update shift history
        const { error: updateError } = await supabase
            .from('shift_history')
            .update({
                status: 'Tutup',
                saldo_akhir: saldoAkhir,
                total_penjualan: totalPenjualan,
                total_cash: totalCash,
                total_transfer: totalTransfer,
                total_retur: totalRetur,
                diserahkan_kepada: data.diserahkan_kepada || '',
                catatan: data.catatan || '',
                waktu_tutup: new Date().toISOString()
            })
            .eq('id', data.id);

        if (updateError) throw updateError;

        // 6. Tandai transaksi dengan closed_shift_id
        await supabase
            .from('penjualan_header')
            .update({ closed_shift_id: data.id })
            .eq('shift_id', data.id);

        await supabase
            .from('retur_penjualan')
            .update({ closed_shift_id: data.id })
            .eq('shift_id', data.id);

        localStorage.removeItem('shift_aktif');

        return { 
            data: {
                id: data.id,
                total_penjualan: totalPenjualan,
                total_cash: totalCash,
                total_transfer: totalTransfer,
                total_retur: totalRetur,
                saldo_akhir: saldoAkhir
            }, 
            error: null 
        };
    } catch(e) {
        console.error('Error tutupShift:', e);
        localStorage.removeItem('shift_aktif');
        return { data: null, error: e };
    }
}

// ============================================================
// STOK OPNAME
// ============================================================
export async function getStokOpname() {
    try {
        const { data, error } = await supabase
            .from('stok_opname')
            .select('*')
            .order('sesi_id', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            const local = localStorage.getItem('opname_history');
            if (local) {
                const parsed = JSON.parse(local);
                const formatted = [];
                parsed.forEach(session => {
                    if (session.items && session.items.length > 0) {
                        session.items.forEach(item => {
                            formatted.push({
                                id: session.id + '-' + item.id,
                                sesi_id: session.id,
                                obat_id: item.id,
                                kode_obat: item.kode_obat || '',
                                nama_obat: item.nama_obat || '',
                                satuan: item.satuan || 'Tablet',
                                snapshot_stok: item.snapshot_stok || 0,
                                stok_sistem: item.stok_sistem || 0,
                                stok_fisik: item.stok_fisik || 0,
                                selisih: item.selisih || 0,
                                tanggal: session.tanggal_selesai ? session.tanggal_selesai.split('T')[0] : '',
                                jam: new Date().toTimeString().slice(0,5),
                                keterangan: session.keterangan || 'Stok Opname',
                                created_at: session.tanggal_selesai || session.tanggal_mulai
                            });
                        });
                    }
                });
                return { data: formatted, error: null };
            }
            return { data: [], error: null };
        }

        const sessions = {};
        data.forEach(row => {
            const sesiId = row.sesi_id || 'LEGACY-' + row.id;
            if (!sessions[sesiId]) {
                sessions[sesiId] = {
                    id: sesiId,
                    tanggal_mulai: row.created_at || row.tanggal || '',
                    tanggal_selesai: row.tanggal || row.created_at || '',
                    total_selisih: 0,
                    jumlah_item: 0,
                    status: 'Selesai',
                    keterangan: row.keterangan || 'Stok Opname',
                    items: []
                };
            }
            sessions[sesiId].items.push({
                id: row.obat_id,
                kode_obat: row.kode_obat || '',
                nama_obat: row.nama_obat || '',
                satuan: row.satuan || 'Tablet',
                snapshot_stok: row.snapshot_stok || 0,
                stok_sistem: row.stok_sistem || 0,
                stok_fisik: row.stok_fisik || 0,
                selisih: row.selisih || 0
            });
            sessions[sesiId].total_selisih += (row.selisih || 0);
            sessions[sesiId].jumlah_item += 1;
        });

        const result = Object.values(sessions);
        localStorage.setItem('opname_history', JSON.stringify(result));

        return { data: result, error: null };
    } catch(e) {
        console.error('Error getStokOpname:', e);
        const local = localStorage.getItem('opname_history');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function saveStokOpname(opnameData) {
    try {
        const { items, sesi_id, tanggal_selesai, total_selisih, keterangan } = opnameData;
        
        if (!items || items.length === 0) {
            return { data: null, error: new Error('Tidak ada item untuk disimpan') };
        }

        const sesiId = sesi_id || 'SO-' + new Date().toISOString().split('T')[0].replace(/-/g, '') + '-' + String(Date.now()).slice(-4);
        const tanggal = tanggal_selesai ? tanggal_selesai.split('T')[0] : new Date().toISOString().split('T')[0];
        const jam = new Date().toTimeString().slice(0, 5);

        const batch = items.map(item => ({
            sesi_id: sesiId,
            obat_id: item.id || item.obat_id,
            kode_obat: item.kode_obat || '',
            nama_obat: item.nama_obat || '',
            satuan: item.satuan || 'Tablet',
            snapshot_stok: item.snapshot_stok || 0,
            stok_sistem: item.stok_sistem || 0,
            stok_fisik: item.stok_fisik || 0,
            selisih: item.selisih || 0,
            tanggal: tanggal,
            jam: jam,
            keterangan: keterangan || 'Stok Opname',
            created_at: new Date().toISOString()
        }));

        const { data, error } = await supabase
            .from('stok_opname')
            .insert(batch)
            .select();

        if (error) throw error;

        for (const item of items) {
            if (item.kode_obat) {
                const { data: obatData, error: obatError } = await supabase
                    .from('obat')
                    .select('id, stok')
                    .eq('kode_obat', item.kode_obat)
                    .single();

                if (!obatError && obatData) {
                    const stokBaru = Math.max(0, Number(item.stok_fisik) || 0);
                    await supabase
                        .from('obat')
                        .update({ stok: stokBaru })
                        .eq('id', obatData.id);

                    await supabase
                        .from('kartu_stok')
                        .insert({
                            obat_id: obatData.id,
                            kode_obat: item.kode_obat,
                            nama_obat: item.nama_obat || '',
                            tanggal: tanggal,
                            jam: jam,
                            no_bukti: 'OPNAME-' + sesiId,
                            keterangan: 'Stok Opname (' + (item.selisih > 0 ? 'Lebih' : 'Kurang') + ')',
                            masuk: item.selisih > 0 ? item.selisih : 0,
                            keluar: item.selisih < 0 ? Math.abs(item.selisih) : 0,
                            sisa_stok: stokBaru
                        });
                }
            }
        }

        const history = JSON.parse(localStorage.getItem('opname_history') || '[]');
        const record = {
            id: sesiId,
            tanggal_mulai: new Date().toISOString(),
            tanggal_selesai: new Date().toISOString(),
            total_selisih: total_selisih || items.reduce((sum, i) => sum + (i.selisih || 0), 0),
            jumlah_item: items.length,
            items: items.map(item => ({
                id: item.id || item.obat_id,
                kode_obat: item.kode_obat || '',
                nama_obat: item.nama_obat || '',
                satuan: item.satuan || 'Tablet',
                snapshot_stok: item.snapshot_stok || 0,
                stok_sistem: item.stok_sistem || 0,
                stok_fisik: item.stok_fisik || 0,
                selisih: item.selisih || 0
            })),
            status: 'Selesai',
            keterangan: keterangan || 'Stok Opname'
        };
        history.push(record);
        localStorage.setItem('opname_history', JSON.stringify(history));

        const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
        items.forEach(item => {
            const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
            if (obat) {
                obat.stok = Math.max(0, Number(item.stok_fisik) || 0);
            }
        });
        localStorage.setItem('obat', JSON.stringify(obatLocal));

        return { data, error: null };
    } catch(e) {
        console.error('Error saveStokOpname:', e);
        
        const history = JSON.parse(localStorage.getItem('opname_history') || '[]');
        const sesiId = opnameData.sesi_id || 'SO-' + new Date().toISOString().split('T')[0].replace(/-/g, '') + '-' + String(Date.now()).slice(-4);
        const record = {
            id: sesiId,
            tanggal_mulai: new Date().toISOString(),
            tanggal_selesai: new Date().toISOString(),
            total_selisih: opnameData.total_selisih || 0,
            jumlah_item: opnameData.items ? opnameData.items.length : 0,
            items: opnameData.items || [],
            status: 'Selesai',
            keterangan: opnameData.keterangan || 'Stok Opname'
        };
        history.push(record);
        localStorage.setItem('opname_history', JSON.stringify(history));

        if (opnameData.items) {
            const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
            opnameData.items.forEach(item => {
                const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
                if (obat) {
                    obat.stok = Math.max(0, Number(item.stok_fisik) || 0);
                }
            });
            localStorage.setItem('obat', JSON.stringify(obatLocal));
        }

        return { data: null, error: e };
    }
}

// ============================================================
// PEMBELIAN
// ============================================================
export async function getPembelian() {
    try {
        const { data, error } = await supabase
            .from('pembelian_header')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getPembelian:', e);
        const local = localStorage.getItem('pembelian_history');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
    }
}

export async function savePembelian(header, details) {
    try {
        const { data: headerData, error: headerError } = await supabase
            .from('pembelian_header')
            .insert(header)
            .select();
        if (headerError) throw headerError;

        const detailsWithId = details.map(d => ({ ...d, pembelian_id: headerData[0].id }));
        const { error: detailError } = await supabase
            .from('pembelian_detail')
            .insert(detailsWithId);
        if (detailError) throw detailError;

        for (const item of details) {
            if (item.kode_obat) {
                const { data: obatData, error: obatError } = await supabase
                    .from('obat')
                    .select('id, stok')
                    .eq('kode_obat', item.kode_obat)
                    .single();
                if (!obatError && obatData) {
                    const stokBaru = (obatData.stok || 0) + (item.jumlah || 0);
                    await supabase
                        .from('obat')
                        .update({ stok: stokBaru })
                        .eq('id', obatData.id);
                    await supabase
                        .from('kartu_stok')
                        .insert({
                            obat_id: obatData.id,
                            kode_obat: item.kode_obat,
                            nama_obat: item.nama_obat || '',
                            tanggal: header.tanggal_faktur || new Date().toISOString().split('T')[0],
                            jam: '00:00',
                            no_bukti: header.no_faktur || 'PEM-' + Date.now(),
                            keterangan: 'Pembelian dari ' + (header.supplier_nama || 'Supplier'),
                            masuk: item.jumlah || 0,
                            sisa_stok: stokBaru
                        });
                }
            }
        }

        const history = JSON.parse(localStorage.getItem('pembelian_history') || '[]');
        const data = { ...header, id: headerData[0].id, items: details };
        history.push(data);
        localStorage.setItem('pembelian_history', JSON.stringify(history));
        const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
        details.forEach(item => {
            const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
            if (obat) {
                obat.stok = (obat.stok || 0) + (item.jumlah || 0);
            }
        });
        localStorage.setItem('obat', JSON.stringify(obatLocal));

        return { data: headerData[0], error: null };
    } catch(e) {
        console.error('Error savePembelian:', e);
        const history = JSON.parse(localStorage.getItem('pembelian_history') || '[]');
        const data = { ...header, id: Date.now(), items: details, saved_offline: true };
        history.push(data);
        localStorage.setItem('pembelian_history', JSON.stringify(history));
        const obatLocal = JSON.parse(localStorage.getItem('obat') || '[]');
        details.forEach(item => {
            const obat = obatLocal.find(o => o.kode_obat === item.kode_obat);
            if (obat) {
                obat.stok = (obat.stok || 0) + (item.jumlah || 0);
            }
        });
        localStorage.setItem('obat', JSON.stringify(obatLocal));
        return { data: { id: data.id, saved_offline: true }, error: e };
    }
}

// ============================================================
// LAPORAN
// ============================================================
export async function getLaporanPenjualanHarian(tanggal) {
    try {
        const { data, error } = await supabase
            .from('penjualan_header')
            .select(`
                *,
                penjualan_detail(*)
            `)
            .eq('tanggal', tanggal)
            .order('jam', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getLaporanPenjualanHarian:', e);
        return { data: [], error: e };
    }
}

export async function getLaporanPenjualanPerObat(obatId, tglAwal, tglAkhir) {
    try {
        let query = supabase
            .from('penjualan_detail')
            .select(`
                *,
                penjualan_header:penjualan_id (
                    no_faktur,
                    tanggal,
                    jam,
                    shift,
                    kasir,
                    pelanggan,
                    metode_pembayaran
                )
            `)
            .eq('obat_id', obatId)
            .order('penjualan_header.tanggal', { ascending: false });
        if (tglAwal && tglAkhir) {
            query = query
                .gte('penjualan_header.tanggal', tglAwal)
                .lte('penjualan_header.tanggal', tglAkhir);
        }
        const { data, error } = await query;
        if (error) throw error;
        const uniqueMap = new Map();
        const uniqueData = [];
        data.forEach(item => {
            const key = `${item.penjualan_id}-${item.obat_id}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                uniqueData.push(item);
            }
        });
        return { data: uniqueData, error: null };
    } catch(e) {
        console.error('Error getLaporanPenjualanPerObat:', e);
        return { data: [], error: e };
    }
}

export async function getLaporanLabaRugi(bulan, tahun) {
    try {
        const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
        const lastDay = new Date(tahun, bulan, 0).getDate();
        const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const { data: penjualan, error: err1 } = await supabase
            .from('penjualan_header')
            .select('total')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate);

        const { data: retur, error: err2 } = await supabase
            .from('retur_penjualan')
            .select('total_retur')
            .gte('tanggal_retur', startDate)
            .lte('tanggal_retur', endDate);

        const { data: detail, error: err3 } = await supabase
            .from('penjualan_detail')
            .select('obat_id, jumlah')
            .gte('penjualan_header.tanggal', startDate)
            .lte('penjualan_header.tanggal', endDate);

        let totalHPP = 0;
        if (detail && detail.length > 0) {
            const obatIds = detail.map(d => d.obat_id);
            const { data: obatList } = await supabase
                .from('obat')
                .select('id, harga_beli')
                .in('id', obatIds);
            const hppMap = {};
            obatList.forEach(o => hppMap[o.id] = o.harga_beli);
            detail.forEach(d => {
                totalHPP += (d.jumlah * (hppMap[d.obat_id] || 0));
            });
        }

        const totalPenjualan = penjualan ? penjualan.reduce((sum, p) => sum + p.total, 0) : 0;
        const totalRetur = retur ? retur.reduce((sum, r) => sum + r.total_retur, 0) : 0;
        const penjualanBersih = totalPenjualan - totalRetur;
        const labaKotor = penjualanBersih - totalHPP;

        return {
            total_penjualan: totalPenjualan,
            total_retur: totalRetur,
            penjualan_bersih: penjualanBersih,
            total_hpp: totalHPP,
            laba_kotor: labaKotor,
            biaya_operasional: 0,
            laba_bersih: labaKotor
        };
    } catch(e) {
        console.error('Error getLaporanLabaRugi:', e);
        return {
            total_penjualan: 0,
            total_retur: 0,
            penjualan_bersih: 0,
            total_hpp: 0,
            laba_kotor: 0,
            biaya_operasional: 0,
            laba_bersih: 0
        };
    }
}
// ============================================================
// KELOLA APLIKASI - USER & PERMISSION
// ============================================================

// GET ALL USERS
export async function getUsers() {
    try {
        const { data, error } = await supabase
            .from('app_users')
            .select('*, user_permissions(*)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getUsers:', e);
        return { data: [], error: e };
    }
}

// GET USER BY ID
export async function getUserById(id) {
    try {
        const { data, error } = await supabase
            .from('app_users')
            .select('*, user_permissions(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getUserById:', e);
        return { data: null, error: e };
    }
}

// CREATE USER - MENGGUNAKAN SERVICE ROLE KEY
export async function createUser(userData) {
    try {
        // 1. Buat user di Supabase Auth menggunakan Service Role Key
        const { data: authData, error: authError } = await adminCreateUser(
            userData.email,
            userData.password,
            { 
                full_name: userData.nama,
                role: userData.role || 'staff'
            }
        );
        
        if (authError) throw authError;
        
        // 2. Insert ke app_users
        const { data, error } = await supabase
            .from('app_users')
            .insert({
                auth_user_id: authData.user.id,
                username: userData.username || userData.email,
                email: userData.email,
                nama: userData.nama,
                role: userData.role || 'staff',
                status: userData.status || 'Aktif'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // 3. Insert permissions
        if (userData.permissions && userData.permissions.length > 0) {
            const permData = userData.permissions.map(p => ({
                user_id: data.id,
                module: p.module,
                can_view: p.can_view || false,
                can_create: p.can_create || false,
                can_edit: p.can_edit || false,
                can_delete: p.can_delete || false
            }));
            
            const { error: permError } = await supabase
                .from('user_permissions')
                .insert(permData);
            
            if (permError) throw permError;
        }
        
        return { data, error: null };
    } catch(e) {
        console.error('Error createUser:', e);
        return { data: null, error: e };
    }
}


// UPDATE USER
export async function updateUser(id, userData) {
    try {
        // Update app_users
        const updateData = {};
        if (userData.nama) updateData.nama = userData.nama;
        if (userData.role) updateData.role = userData.role;
        if (userData.status) updateData.status = userData.status;
        
        const { data, error } = await supabase
            .from('app_users')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        
        // Update permissions
        if (userData.permissions) {
            // Delete existing
            await supabase
                .from('user_permissions')
                .delete()
                .eq('user_id', id);
            
            // Insert new
            const permData = userData.permissions.map(p => ({
                user_id: id,
                module: p.module,
                can_view: p.can_view || false,
                can_create: p.can_create || false,
                can_edit: p.can_edit || false,
                can_delete: p.can_delete || false
            }));
            
            const { error: permError } = await supabase
                .from('user_permissions')
                .insert(permData);
            
            if (permError) throw permError;
        }
        
        return { data, error: null };
    } catch(e) {
        console.error('Error updateUser:', e);
        return { data: null, error: e };
    }
}

// DELETE USER - MENGGUNAKAN SERVICE ROLE KEY
export async function deleteUser(id) {
    try {
        // Get auth_user_id
        const { data: userData, error: userError } = await supabase
            .from('app_users')
            .select('auth_user_id')
            .eq('id', id)
            .single();
        
        if (userError) throw userError;
        
        // Delete from app_users
        const { error } = await supabase
            .from('app_users')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        // Delete from auth menggunakan Service Role Key
        if (userData.auth_user_id) {
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
                userData.auth_user_id
            );
            if (authError) console.warn('Gagal menghapus dari auth:', authError);
        }
        
        return { error: null };
    } catch(e) {
        console.error('Error deleteUser:', e);
        return { error: e };
    }
}

// GET ALL MODULES
export async function getModules() {
    try {
        const { data, error } = await supabase
            .from('app_modules')
            .select('*')
            .order('module_name');
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getModules:', e);
        return { data: [], error: e };
    }
}

// GET USER PERMISSIONS
export async function getUserPermissions(userId) {
    try {
        const { data, error } = await supabase
            .from('user_permissions')
            .select('*')
            .eq('user_id', userId);
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getUserPermissions:', e);
        return { data: [], error: e };
    }
}

// CHECK PERMISSION
export async function hasPermission(userId, moduleKey, action = 'view') {
    try {
        const { data, error } = await supabase
            .from('user_permissions')
            .select('can_view, can_create, can_edit, can_delete')
            .eq('user_id', userId)
            .eq('module', moduleKey)
            .single();
        
        if (error) return { has: false, error: null };
        
        const has = action === 'view' ? data.can_view :
                   action === 'create' ? data.can_create :
                   action === 'edit' ? data.can_edit :
                   data.can_delete;
        
        return { has: has || false, error: null };
    } catch(e) {
        return { has: false, error: e };
    }
}

// GET CURRENT USER PERMISSIONS
export async function getCurrentUserPermissions() {
    try {
        // Ambil user saat ini
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) return { data: [], error: null };
        
        // Cari di app_users
        const { data: appUser, error: appError } = await supabase
            .from('app_users')
            .select('id, role')
            .eq('auth_user_id', user.id)
            .single();
        
        if (appError) throw appError;
        
        // Jika admin, return semua permissions = true
        if (appUser.role === 'admin') {
            const { data: modules } = await getModules();
            const allPerms = modules.map(m => ({
                module: m.module_key,
                can_view: true,
                can_create: true,
                can_edit: true,
                can_delete: true
            }));
            return { data: allPerms, error: null };
        }
        
        // Ambil permissions user
        const { data, error } = await getUserPermissions(appUser.id);
        return { data, error };
    } catch(e) {
        console.error('Error getCurrentUserPermissions:', e);
        return { data: [], error: e };
    }
}

// ============================================================
// AUDIT LOG
// ============================================================
export async function logAudit(userId, username, action, details) {
    try {
        const { error } = await supabase
            .from('audit_log')
            .insert({
                user_id: userId,
                username: username,
                action: action,
                details: details
            });
        return { error };
    } catch(e) {
        console.error('Error logAudit:', e);
        return { error: e };
    }
}

export async function getAuditLogs(limit = 100) {
    try {
        const { data, error } = await supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error getAuditLogs:', e);
        return { data: [], error: e };
    }
}