// src/database.js
import { supabase } from './supabase.js';

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
        // Fallback ke localStorage
        const local = localStorage.getItem('obat');
        if (local) {
            return { data: JSON.parse(local), error: null };
        }
        return { data: [], error: e };
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
        const { data, error } = await supabase
            .from('apoteker')
            .upsert(apotekerData, { onConflict: 'id' })
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
// PENJUALAN
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

export async function savePenjualan(header, details) {
    try {
        const { data: headerData, error: headerError } = await supabase
            .from('penjualan_header')
            .insert(header)
            .select();
        
        if (headerError) throw headerError;
        
        const detailsWithId = details.map(d => ({
            ...d,
            penjualan_id: headerData[0].id
        }));
        
        const { error: detailError } = await supabase
            .from('penjualan_detail')
            .insert(detailsWithId);
        
        if (detailError) throw detailError;
        
        // Simpan ke localStorage sebagai backup
        const history = JSON.parse(localStorage.getItem('penjualan_history') || '[]');
        const data = { ...header, id: headerData[0].id, items: details };
        history.push(data);
        localStorage.setItem('penjualan_history', JSON.stringify(history));
        
        return { data: headerData[0], error: null };
    } catch(e) {
        console.error('Error savePenjualan:', e);
        // Fallback ke localStorage
        const history = JSON.parse(localStorage.getItem('penjualan_history') || '[]');
        const data = { ...header, id: Date.now(), items: details };
        history.push(data);
        localStorage.setItem('penjualan_history', JSON.stringify(history));
        return { data: { id: data.id }, error: null };
    }
}

// ============================================================
// RETUR PENJUALAN
// ============================================================
export async function getAllRetur() {
    try {
        const { data, error } = await supabase
            .from('retur_penjualan')
            .select('*')
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

export async function saveRetur(returData, detailRetur) {
    try {
        // Cek batas retur 3 hari
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
        
        const { data: returHeader, error: headerError } = await supabase
            .from('retur_penjualan')
            .insert({
                ...returData,
                shift_asal: transaksi.shift,
                tanggal_asal: transaksi.tanggal,
                jam_asal: transaksi.jam
            })
            .select();
        
        if (headerError) throw headerError;
        
        const detailsWithId = detailRetur.map(d => ({
            ...d,
            retur_id: returHeader[0].id
        }));
        
        const { error: detailError } = await supabase
            .from('retur_detail')
            .insert(detailsWithId);
        
        if (detailError) throw detailError;
        
        // Backup ke localStorage
        const history = JSON.parse(localStorage.getItem('retur_penjualan') || '[]');
        history.push({ ...returData, id: returHeader[0].id, items: detailRetur });
        localStorage.setItem('retur_penjualan', JSON.stringify(history));
        
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
// SHIFT
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
        return { data: data && data.length > 0 ? data[0] : null, error: null };
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
        const { data: result, error } = await supabase
            .from('shift_history')
            .insert({
                shift: data.shift,
                tanggal: data.tanggal,
                username: data.user,
                saldo_awal: data.saldo_awal,
                status: 'Buka',
                waktu_buka: new Date().toISOString()
            })
            .select();
        
        if (error) throw error;
        
        const shiftData = result && result.length > 0 ? result[0] : null;
        localStorage.setItem('shift_aktif', JSON.stringify(shiftData));
        return { data: shiftData, error: null };
    } catch(e) {
        console.error('Error bukaShift:', e);
        const shiftData = { ...data, id: Date.now(), status: 'Buka', waktu_buka: new Date().toISOString() };
        localStorage.setItem('shift_aktif', JSON.stringify(shiftData));
        return { data: shiftData, error: null };
    }
}

export async function tutupShift(data) {
    try {
        const { error } = await supabase
            .from('shift_history')
            .update({
                status: 'Tutup',
                saldo_akhir: data.saldo_akhir,
                total_penjualan: data.total_penjualan || 0,
                total_cash: data.total_cash || 0,
                total_transfer: data.total_transfer || 0,
                total_retur: data.total_retur || 0,
                diserahkan_kepada: data.diserahkan_kepada,
                catatan: data.catatan,
                waktu_tutup: new Date().toISOString()
            })
            .eq('id', data.id);
        
        if (error) throw error;
        localStorage.removeItem('shift_aktif');
        return { error: null };
    } catch(e) {
        console.error('Error tutupShift:', e);
        localStorage.removeItem('shift_aktif');
        return { error: null };
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
            .order('tanggal', { ascending: false });
        if (error) throw error;
        return { data, error: null };
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
        const { data, error } = await supabase
            .from('stok_opname')
            .insert(opnameData)
            .select();
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error saveStokOpname:', e);
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
        
        const detailsWithId = details.map(d => ({
            ...d,
            pembelian_id: headerData[0].id
        }));
        
        const { error: detailError } = await supabase
            .from('pembelian_detail')
            .insert(detailsWithId);
        
        if (detailError) throw detailError;
        
        const history = JSON.parse(localStorage.getItem('pembelian_history') || '[]');
        history.push({ ...header, id: headerData[0].id, items: details });
        localStorage.setItem('pembelian_history', JSON.stringify(history));
        
        return { data: headerData[0], error: null };
    } catch(e) {
        console.error('Error savePembelian:', e);
        const history = JSON.parse(localStorage.getItem('pembelian_history') || '[]');
        const data = { ...header, id: Date.now(), items: details, saved_offline: true };
        history.push(data);
        localStorage.setItem('pembelian_history', JSON.stringify(history));
        return { data: { id: data.id }, error: null };
    }
}

// ============================================================
// LAPORAN
// ============================================================
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
            .order('penjualan_header(tanggal)', { ascending: false });
        
        if (tglAwal && tglAkhir) {
            query = query
                .gte('penjualan_header.tanggal', tglAwal)
                .lte('penjualan_header.tanggal', tglAkhir);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return { data, error: null };
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