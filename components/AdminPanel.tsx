
import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { getAllLocations, addCustomLocation, deleteCustomLocation, updateCustomLocation, addBulkCustomLocations, parseCoordinatesFromUrl, toggleBuiltInLocation, getCategories, addCategory, deleteCategory } from '../services/geminiService';
import { LocationData, MapCategory } from '../types';
import { Trash2, Edit, Save, Plus, MapPin, X, ExternalLink, Search, RefreshCw, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Ban, Undo2, Layers, Image as ImageIcon, Map as MapIcon, Upload } from 'lucide-react';

const AdminPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'locations' | 'categories'>('locations');
    
    // --- LOCATION STATES ---
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [filter, setFilter] = useState<'all' | 'custom' | 'builtin'>('all');
    const [search, setSearch] = useState('');
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<LocationData>>({});
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Add New Location State
    const [newUrl, setNewUrl] = useState('');
    const [newLat, setNewLat] = useState('');
    const [newLng, setNewLng] = useState('');
    const [newCity, setNewCity] = useState('');
    const [newCountry, setNewCountry] = useState('');
    const [newRegion, setNewRegion] = useState('');
    const [newLocCategoryId, setNewLocCategoryId] = useState('cat_world');
    const [isAdding, setIsAdding] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);

    // --- CATEGORY STATES ---
    const [categories, setCategories] = useState<MapCategory[]>([]);
    const [newCatName, setNewCatName] = useState('');
    const [newCatDesc, setNewCatDesc] = useState('');
    const [newCatImage, setNewCatImage] = useState('');

    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadData();
    }, []);

    // Reset pagination when filter or search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, search]);

    const loadData = () => {
        setLocations(getAllLocations());
        setCategories(getCategories());
    };

    // --- LOCATION HANDLERS ---

    const handleDelete = (id: string) => {
        if (window.confirm('Hapus lokasi ini permanen?')) {
            deleteCustomLocation(id);
            loadData();
        }
    };
    
    const handleToggleBuiltIn = (id: string) => {
        toggleBuiltInLocation(id);
        loadData();
    };

    const handleEditClick = (loc: LocationData) => {
        setIsEditing(loc.id || null);
        setEditForm({ ...loc });
    };

    const handleSaveEdit = () => {
        if (editForm.id && editForm.city && editForm.country) {
            updateCustomLocation(editForm as LocationData);
            setIsEditing(null);
            loadData();
        }
    };

    const fetchLocationDetails = async (lat: number, lng: number) => {
        setIsDetecting(true);
        setNewCity("Detecting...");
        setNewCountry("...");
        setNewRegion("...");

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                headers: { 'User-Agent': 'GeoGuesserGame/1.0' }
            });

            if (response.ok) {
                const data = await response.json();
                const address = data.address;
                if (address) {
                    const detectedCity = address.city || address.town || address.municipality || address.county || address.city_district || address.district || address.village || "";
                    setNewCity(detectedCity);
                    setNewCountry(address.country || "");
                    setNewRegion(address.state || address.region || "");
                } else {
                    setNewCity("");
                    setNewCountry("");
                    setNewRegion("");
                }
            }
        } catch (e) {
            console.error("Auto-detect failed", e);
            setNewCity("");
            setNewCountry("");
            setNewRegion("");
        } finally {
            setIsDetecting(false);
        }
    };

    const handleUrlParse = (url: string) => {
        setNewUrl(url);
        const coords = parseCoordinatesFromUrl(url);
        if (coords) {
            setNewLat(coords.lat.toString());
            setNewLng(coords.lng.toString());
            fetchLocationDetails(coords.lat, coords.lng);
        }
    };

    const handleManualDetect = () => {
        if (newLat && newLng) {
            fetchLocationDetails(parseFloat(newLat), parseFloat(newLng));
        }
    };

    const handleAddLocation = async () => {
        if (!newLat || !newLng) return;
        setIsAdding(true);
        try {
            const lat = parseFloat(newLat);
            const lng = parseFloat(newLng);
            
            // If city is filled manually, use it, otherwise fetch
            const manualData = { 
                city: newCity, 
                country: newCountry, 
                region: newRegion,
                categoryId: newLocCategoryId 
            };
            
            await addCustomLocation(lat, lng, manualData);
            
            setNewUrl(''); setNewLat(''); setNewLng(''); setNewCity(''); setNewCountry(''); setNewRegion('');
            loadData();
            alert('Lokasi berhasil ditambahkan!');
        } catch (e: any) {
            alert('Gagal: ' + e.message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim().replace(/^\uFEFF/,''),
            complete: (results) => {
                try {
                    const parsedData = results.data as any[];
                    let importedCount = 0;
                    
                    const newLocations: LocationData[] = [];

                    for (const row of parsedData) {
                        const cityName = row.city_ascii || row.city;
                        if (row.lat && row.lng && cityName && row.country) {
                            newLocations.push({
                                id: '_' + Math.random().toString(36).substr(2, 5),
                                isCustom: true,
                                categoryId: newLocCategoryId || 'cat_world',
                                lat: parseFloat(row.lat),
                                lng: parseFloat(row.lng),
                                city: cityName.trim(),
                                country: row.country.trim(),
                                continent: row.continent,
                                population: row.population ? parseInt(row.population, 10) : undefined,
                            });
                            importedCount++;
                        }
                    }

                    if (newLocations.length > 0) {
                        addBulkCustomLocations(newLocations);
                        loadData();
                        alert(`Berhasil mengimpor ${importedCount} lokasi!`);
                    } else {
                        alert('Tidak ada data valid yang ditemukan. Pastikan format CSV sesuai (butuh header lat, lng, city_ascii, country).');
                    }
                } catch (e: any) {
                    alert('Gagal impor data: ' + e.message);
                } finally {
                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (err) => {
                alert('Gagal membaca file: ' + err.message);
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        });
    };

    // --- CATEGORY HANDLERS ---

    const handleAddCategory = () => {
        if (!newCatName || !newCatImage) {
            alert("Nama dan URL Gambar wajib diisi!");
            return;
        }

        const newId = 'cat_' + Date.now().toString(36);
        const newCat: MapCategory = {
            id: newId,
            name: newCatName,
            description: newCatDesc,
            imageUrl: newCatImage,
            isBuiltIn: false
        };

        addCategory(newCat);
        setNewCatName(''); setNewCatDesc(''); setNewCatImage('');
        loadData();
    };

    const handleDeleteCategory = (id: string) => {
        if (window.confirm("Hapus kategori ini? Lokasi di dalamnya tidak akan terhapus tapi mungkin perlu dipindahkan.")) {
            deleteCategory(id);
            loadData();
        }
    };

    // --- FILTER & PAGINATION ---
    const filteredLocations = locations.filter(l => {
        const matchesFilter = filter === 'all' 
            ? true 
            : filter === 'custom' 
                ? l.isCustom 
                : !l.isCustom;
        
        const matchesSearch = l.city.toLowerCase().includes(search.toLowerCase()) || 
                              l.country.toLowerCase().includes(search.toLowerCase());
        
        return matchesFilter && matchesSearch;
    });

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredLocations.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);

    const handlePageChange = (pageNumber: number) => {
        setCurrentPage(pageNumber);
    };

    return (
        <div className="h-screen w-full bg-slate-950 text-slate-200 p-4 md:p-8 font-sans overflow-y-auto">
            <div className="max-w-7xl mx-auto pb-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-2">
                            <MapPin className="text-cyan-400" /> GeoMad Admin
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">Kelola database lokasi dan kategori map.</p>
                    </div>
                    <a href="/" className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition flex items-center gap-2 text-sm font-bold">
                        <ArrowLeft size={16} /> Back to Game
                    </a>
                </div>

                {/* TABS */}
                <div className="flex gap-4 mb-6 border-b border-slate-800 pb-1">
                    <button 
                        onClick={() => setActiveTab('locations')}
                        className={`pb-2 px-4 font-bold text-sm transition ${activeTab === 'locations' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Locations
                    </button>
                    <button 
                         onClick={() => setActiveTab('categories')}
                         className={`pb-2 px-4 font-bold text-sm transition ${activeTab === 'categories' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Categories
                    </button>
                </div>

                {activeTab === 'locations' && (
                    <>
                         {/* ADD NEW LOCATION SECTION */}
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 mb-8 shadow-xl">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Plus className="text-green-400" /> Tambah Lokasi Baru
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                <div className="lg:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">URL Google Maps / MapCrunch</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={newUrl}
                                            onChange={(e) => handleUrlParse(e.target.value)}
                                            placeholder="Paste URL here to auto-fill Lat/Lng..."
                                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none pl-8"
                                        />
                                        <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Latitude</label>
                                    <input 
                                        type="number" 
                                        value={newLat}
                                        onChange={(e) => setNewLat(e.target.value)}
                                        placeholder="-6.2088"
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Longitude</label>
                                    <input 
                                        type="number" 
                                        value={newLng}
                                        onChange={(e) => setNewLng(e.target.value)}
                                        placeholder="106.8456"
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"
                                    />
                                    {/* Manual Detect Button */}
                                    <button 
                                        onClick={handleManualDetect}
                                        title="Auto Detect Name from Coordinates"
                                        className="absolute right-1 top-7 p-1 bg-slate-700 hover:bg-slate-600 rounded text-cyan-400"
                                    >
                                        <MapIcon size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Manual Details & Category */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-end">
                                <div className="md:col-span-3 grid grid-cols-3 gap-4">
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 mb-1">City</label>
                                         <input type="text" placeholder={isDetecting ? "Detecting..." : "City Name"} value={newCity} onChange={e => setNewCity(e.target.value)} className="w-full bg-slate-950 border border-slate-600 rounded p-2 text-xs text-white"/>
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 mb-1">Country</label>
                                         <input type="text" placeholder={isDetecting ? "..." : "Country Name"} value={newCountry} onChange={e => setNewCountry(e.target.value)} className="w-full bg-slate-950 border border-slate-600 rounded p-2 text-xs text-white"/>
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 mb-1">Region</label>
                                         <input type="text" placeholder={isDetecting ? "..." : "Region"} value={newRegion} onChange={e => setNewRegion(e.target.value)} className="w-full bg-slate-950 border border-slate-600 rounded p-2 text-xs text-white"/>
                                     </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                                    <select 
                                        value={newLocCategoryId} 
                                        onChange={(e) => setNewLocCategoryId(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-xs text-white focus:border-cyan-500"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                                <button 
                                    onClick={handleAddLocation} 
                                    disabled={!newLat || !newLng || isAdding}
                                    className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-white font-bold transition flex items-center gap-2 w-full sm:w-auto"
                                >
                                    {isAdding ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16} />} 
                                    Simpan ke Database
                                </button>
                                
                                <div className="flex items-center gap-2 text-xs text-slate-400 w-full sm:w-auto mt-4 sm:mt-0 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                    <Upload size={16} className="text-cyan-400" />
                                    <div>
                                        <p className="font-bold text-white mb-1">Punya file CSV Database Kota?</p>
                                        <p className="mb-2">Format: "city_ascii", "lat", "lng", "country", dsb.</p>
                                        <input 
                                            type="file" 
                                            accept=".csv"
                                            ref={fileInputRef}
                                            onChange={handleImportCSV}
                                            className="hidden"
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isImporting}
                                            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 rounded text-white font-bold transition flex items-center gap-1"
                                        >
                                            {isImporting ? <RefreshCw className="animate-spin" size={12}/> : <Upload size={12} />} 
                                            Import dari CSV
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* LIST SECTION */}
                        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl flex flex-col">
                            {/* Filter bar... (Keep same logic as before) */}
                             <div className="p-4 border-b border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex gap-2">
                                    <button onClick={() => setFilter('all')} className={`px-3 py-1 text-xs font-bold rounded ${filter === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>All ({locations.length})</button>
                                    <button onClick={() => setFilter('custom')} className={`px-3 py-1 text-xs font-bold rounded ${filter === 'custom' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Custom ({locations.filter(l=>l.isCustom).length})</button>
                                    <button onClick={() => setFilter('builtin')} className={`px-3 py-1 text-xs font-bold rounded ${filter === 'builtin' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Built-in ({locations.filter(l=>!l.isCustom).length})</button>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Cari kota/negara..." 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white w-full md:w-64"
                                />
                            </div>

                            <div className="overflow-x-auto min-h-[400px]">
                                <table className="w-full text-left text-sm text-slate-400">
                                    <thead className="bg-slate-950 text-slate-200 uppercase text-xs font-bold">
                                        <tr>
                                            <th className="p-4">Type</th>
                                            <th className="p-4">Category</th>
                                            <th className="p-4">City</th>
                                            <th className="p-4">Country</th>
                                            <th className="p-4">Coordinates</th>
                                            <th className="p-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {currentItems.map((loc) => {
                                            const catName = categories.find(c => c.id === loc.categoryId)?.name || 'Unknown';
                                            return (
                                                <tr key={loc.id || `${loc.lat}_${loc.lng}`} className={`hover:bg-slate-800/50 transition ${loc.isDisabled ? 'opacity-40 bg-red-900/10 grayscale' : ''}`}>
                                                    <td className="p-4">
                                                        {loc.isCustom ? <span className="text-green-400 font-bold text-xs">CUSTOM</span> : <span className="text-slate-500 font-bold text-xs">BUILT-IN</span>}
                                                    </td>
                                                    <td className="p-4">
                                                        {isEditing === loc.id && loc.isCustom ? (
                                                            <select value={editForm.categoryId} onChange={e=>setEditForm({...editForm, categoryId: e.target.value})} className="bg-slate-950 border border-slate-600 rounded px-2 py-1 text-white text-xs">
                                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                            </select>
                                                        ) : (
                                                            <span className="px-2 py-1 rounded bg-slate-800 text-xs font-medium border border-slate-700">{catName}</span>
                                                        )}
                                                    </td>
                                                    {isEditing === loc.id && loc.isCustom ? (
                                                        <>
                                                            <td className="p-4"><input type="text" value={editForm.city} onChange={e=>setEditForm({...editForm, city: e.target.value})} className="bg-slate-950 border border-slate-600 rounded px-2 py-1 text-white w-full"/></td>
                                                            <td className="p-4"><input type="text" value={editForm.country} onChange={e=>setEditForm({...editForm, country: e.target.value})} className="bg-slate-950 border border-slate-600 rounded px-2 py-1 text-white w-full"/></td>
                                                            <td className="p-4 text-xs font-mono">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</td>
                                                            <td className="p-4 text-right flex justify-end gap-2">
                                                                <button onClick={handleSaveEdit} className="p-1.5 bg-green-600 rounded text-white hover:bg-green-500"><Save size={16}/></button>
                                                                <button onClick={() => setIsEditing(null)} className="p-1.5 bg-slate-600 rounded text-white hover:bg-slate-500"><X size={16}/></button>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-4 font-bold text-white">{loc.city}</td>
                                                            <td className="p-4">{loc.country}</td>
                                                            <td className="p-4 font-mono text-xs">
                                                                <a href={`https://maps.google.com/?q=&layer=c&cbll=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-cyan-400">
                                                                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} <ExternalLink size={10}/>
                                                                </a>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {loc.isCustom ? (
                                                                    <div className="flex justify-end gap-2">
                                                                        <button onClick={() => handleEditClick(loc)} className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded transition"><Edit size={16}/></button>
                                                                        <button onClick={() => handleDelete(loc.id!)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition"><Trash2 size={16}/></button>
                                                                    </div>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handleToggleBuiltIn(loc.id!)} 
                                                                        className={`p-1.5 rounded transition flex items-center gap-1 text-[10px] font-bold border ${loc.isDisabled ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30'}`}
                                                                    >
                                                                        {loc.isDisabled ? "ENABLE" : "DISABLE"}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination Controls... (Same as before) */}
                             {filteredLocations.length > 0 && (
                                <div className="p-4 border-t border-slate-700 bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <span className="text-xs text-slate-400 font-medium">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 border border-slate-600"><ChevronLeft size={16} /></button>
                                        <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 border border-slate-600"><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'categories' && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                         {/* ADD CATEGORY FORM */}
                         <div className="lg:col-span-1">
                             <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl sticky top-6">
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Layers className="text-purple-400" /> New Category
                                </h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Name</label>
                                        <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-purple-500" placeholder="e.g., Hidden Gems"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Description</label>
                                        <textarea value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-purple-500" placeholder="Short description..."/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Cover Image URL</label>
                                        <input type="text" value={newCatImage} onChange={e => setNewCatImage(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white focus:border-purple-500" placeholder="https://..."/>
                                    </div>
                                    <button onClick={handleAddCategory} className="w-full py-2 bg-purple-600 hover:bg-purple-500 rounded text-white font-bold transition">
                                        Add Category
                                    </button>
                                </div>
                             </div>
                         </div>

                         {/* CATEGORY LIST */}
                         <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                             {categories.map(cat => {
                                 const count = locations.filter(l => l.categoryId === cat.id && !l.isDisabled).length;
                                 return (
                                     <div key={cat.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden group">
                                         <div className="h-32 w-full overflow-hidden relative">
                                             <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                                             <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
                                             {cat.isBuiltIn && <span className="absolute top-2 right-2 bg-slate-800/80 text-xs font-bold px-2 py-0.5 rounded border border-slate-600">Built-in</span>}
                                         </div>
                                         <div className="p-4">
                                             <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-lg font-bold text-white">{cat.name}</h3>
                                                {!cat.isBuiltIn && (
                                                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-400 hover:bg-red-900/20 p-1.5 rounded transition"><Trash2 size={16}/></button>
                                                )}
                                             </div>
                                             <p className="text-sm text-slate-400 mb-3 line-clamp-2">{cat.description}</p>
                                             <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                                                 <MapPin size={12} /> {count} Active Locations
                                             </div>
                                         </div>
                                     </div>
                                 )
                             })}
                         </div>
                     </div>
                )}

            </div>
        </div>
    );
};

export default AdminPanel;
