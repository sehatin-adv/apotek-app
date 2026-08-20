import { supabase } from './supabase.js';

// ============================================================
// OBAT
// ============================================================
export async function getObat() {
    const { data, error } = await supabase
        .from('obat')
        .select('*')
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function getObatById(id) {
    const { data, error } = await supabase
        .from('obat')
        .select('*')
        .eq('id', id)
        .single();
    return { data, error };
}

export async function saveObat(obatData) {
    const { data, error } = await supabase
        .from('obat')
        .upsert(obatData, { onConflict: 'id' })
        .select();
    return { data, error };
}

export async function deleteObat(id) {
    const { error } = await supabase
        .from('obat')
        .delete()
        .eq('id', id);
    return { error };
}

// ============================================================
// SUPPLIER
// ============================================================
export async function getSupplier() {
    const { data, error } = await supabase
        .from('supplier')
        .select('*')
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function saveSupplier(supplierData) {
    const { data, error } = await supabase
        .from('supplier')
        .upsert(supplierData, { onConflict: 'id' })
        .select();
    return { data, error };
}

export async function deleteSupplier(id) {
    const { error } = await supabase
        .from('supplier')
        .delete()
        .eq('id', id);
    return { error };
}

// ============================================================
// APOTEKER
// ============================================================
export async function getApoteker() {
    const { data, error } = await supabase
        .from('apoteker')
        .select('*')
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function saveApoteker(apotekerData) {
    const { data, error } = await supabase
        .from('apoteker')
        .upsert(apotekerData, { onConflict: 'id' })
        .select();
    return { data, error };
}

export async function deleteApoteker(id) {
    const { error } = await supabase
        .from('apoteker')
        .delete()
        .eq('id', id);
    return { error };
}

// ============================================================
// PENJUALAN
// ============================================================
export async function getPenjualan(tanggalMulai, tanggalAkhir) {
    let query = supabase
        .from('penjualan_header')
        .select('*')
        .order('tanggal', { ascending: false })
        .order('jam', { ascending: false });
    
    if (tanggalMulai && tanggalAkhir) {
        query = query.gte('tanggal', tanggalMulai).lte('tanggal', tanggalAkhir);
    }
    
    const { data, error } = await query;
    return { data, error };
}

export async function getPenjualanByNoFaktur(noFaktur) {
    const { data, error } = await supabase
        .from('penjualan_header')
        .select('*, penjualan_detail(*)')
        .eq('no_faktur', noFaktur)
        .single();
    return { data, error };
}

export async function savePenjualan(header, details) {
    const { data: headerData, error: headerError } = await supabase
        .from('penjualan_header')
        .insert(header)
        .select();
    
    if (headerError) return { error: headerError };
    
    const detailsWithId = details.map(d => ({
        ...d,
        penjualan_id: headerData[0].id
    }));
    
    const { error: detailError } = await supabase
        .from('penjualan_detail')
        .insert(detailsWithId);
    
    if (detailError) return { error: detailError };
    
    return { data: headerData[0], error: null };
}

// ============================================================
// RETUR PENJUALAN
// ============================================================
export async function getReturByNoFaktur(noFaktur) {
    const { data, error } = await supabase
        .from('retur_penjualan')
        .select('*, retur_detail(*)')
        .eq('no_faktur', noFaktur);
    return { data, error };
}

export async function getAllRetur() {
    const { data, error } = await supabase
        .from('retur_penjualan')
        .select('*, retur_detail(*)')
        .order('tanggal_retur', { ascending: false });
    return { data, error };
}

export async function saveRetur(returData, detailRetur) {
    // Cek batas retur 3 hari
    const { data: transaksi, error: transError } = await supabase
        .from('penjualan_header')
        .select('tanggal, jam, shift')
        .eq('no_faktur', returData.no_faktur)
        .single();
    
    if (transError) return { error: transError };
    
    const tglTransaksi = new Date(transaksi.tanggal);
    const tglRetur = new Date(returData.tanggal_retur);
    const selisihHari = Math.floor((tglRetur - tglTransaksi) / (1000 * 60 * 60 * 24));
    
    if (selisihHari > 3) {
        return { 
            error: { 
                message: 'Retur tidak dapat dilakukan karena transaksi sudah melewati batas waktu retur maksimal 3 hari.',
                code: 'RETUR_EXPIRED'
            } 
        };
    }
    
    // Insert retur
    const { data: returHeader, error: headerError } = await supabase
        .from('retur_penjualan')
        .insert({
            ...returData,
            shift_asal: transaksi.shift,
            tanggal_asal: transaksi.tanggal,
            jam_asal: transaksi.jam
        })
        .select();
    
    if (headerError) return { error: headerError };
    
    // Insert detail retur
    const detailsWithId = detailRetur.map(d => ({
        ...d,
        retur_id: returHeader[0].id
    }));
    
    const { error: detailError } = await supabase
        .from('retur_detail')
        .insert(detailsWithId);
    
    if (detailError) return { error: detailError };
    
    return { data: returHeader[0], error: null };
}

// ============================================================
// KARTU STOK
// ============================================================
export async function getKartuStok(obatId, tglAwal, tglAkhir) {
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
    return { data, error };
}

// ============================================================
// SHIFT
// ============================================================
export async function getShiftAktif() {
    const { data, error } = await supabase
        .from('shift_history')
        .select('*')
        .eq('status', 'Buka')
        .order('waktu_buka', { ascending: false })
        .limit(1);
    
    return { data: data && data.length > 0 ? data[0] : null, error };
}

export async function bukaShift(data) {
    const { data: result, error } = await supabase
        .from('shift_history')
        .insert({
            shift: data.shift,
            tanggal: data.tanggal,
            user: data.user,
            saldo_awal: data.saldo_awal,
            status: 'Buka',
            waktu_buka: new Date().toISOString()
        })
        .select();
    
    return { data: result && result.length > 0 ? result[0] : null, error };
}

export async function tutupShift(data) {
    const { error } = await supabase
        .from('shift_history')
        .update({
            status: 'Tutup',
            saldo_akhir: data.saldo_akhir,
            total_penjualan: data.total_penjualan,
            total_cash: data.total_cash,
            total_transfer: data.total_transfer,
            total_retur: data.total_retur,
            diserahkan_kepada: data.diserahkan_kepada,
            catatan: data.catatan,
            waktu_tutup: new Date().toISOString()
        })
        .eq('id', data.id);
    
    return { error };
}

// ============================================================
// STOK OPNAME
// ============================================================
export async function getStokOpname() {
    const { data, error } = await supabase
        .from('stok_opname')
        .select('*')
        .order('tanggal', { ascending: false });
    return { data, error };
}

export async function saveStokOpname(opnameData) {
    const { data, error } = await supabase
        .from('stok_opname')
        .insert(opnameData)
        .select();
    return { data, error };
}

// ============================================================
// PEMBELIAN
// ============================================================
export async function getPembelian() {
    const { data, error } = await supabase
        .from('pembelian_header')
        .select('*')
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function savePembelian(header, details) {
    const { data: headerData, error: headerError } = await supabase
        .from('pembelian_header')
        .insert(header)
        .select();
    
    if (headerError) return { error: headerError };
    
    const detailsWithId = details.map(d => ({
        ...d,
        pembelian_id: headerData[0].id
    }));
    
    const { error: detailError } = await supabase
        .from('pembelian_detail')
        .insert(detailsWithId);
    
    if (detailError) return { error: detailError };
    
    return { data: headerData[0], error: null };
}

// ============================================================
// LAPORAN
// ============================================================
export async function getLaporanPenjualanHarian(tanggal) {
    const { data, error } = await supabase
        .from('penjualan_header')
        .select(`
            *,
            penjualan_detail(*)
        `)
        .eq('tanggal', tanggal)
        .order('jam', { ascending: false });
    
    return { data, error };
}

export async function getLaporanPenjualanPerObat(obatId, tglAwal, tglAkhir) {
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
    return { data, error };
}

export async function getLaporanLabaRugi(bulan, tahun) {
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
}