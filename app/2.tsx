'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, formatEther } from 'ethers';
import { createInstance, FhevmInstance } from 'fhevmjs';
import { Shield, Lock, Wallet, ChevronRight, Gavel, Clock, Trophy, ExternalLink, User, X, FileText, CheckCircle2, PlusCircle, Search, Share2, ArrowLeft, Trash2, Zap, EyeOff, Activity } from 'lucide-react';

const CONTRACT_ADDRESS = "0xa1B648CB6Da8bCB3bF3856D31C7AB18A950A7EE9";

const ABI = [
  "function createAuction(string _name, string _imageUri, address _nftContract, uint256 _tokenId, uint256 _duration) public",
  "function bid(uint256 _auctionId, bytes calldata input, bytes calldata inputProof) public",
  "function endAuction(uint256 _auctionId) public",
  "function cancelAuction(uint256 _auctionId) public",
  "function auctionCount() view returns (uint256)",
  "function auctions(uint256) view returns (uint256 id, address creator, string name, string imageUri, address nftContract, uint256 tokenId, uint256 endTime, bool isActive, bool isFinalized)"
];

const ERC721_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

interface AuctionData {
  id: number;
  creator: string;
  name: string;
  imageUri: string;
  nftContract: string;
  tokenId: number;
  endTime: number;
  isActive: boolean;
  timeLeft?: string;
}

export default function ShadowBidMarketplace() {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0.00');
  const [fhevm, setFhevm] = useState<FhevmInstance | null>(null);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Navigation: 'gallery' | 'create' | 'view_auction'
  const [view, setView] = useState('gallery');
  const [selectedAuction, setSelectedAuction] = useState<AuctionData | null>(null);
  
  // Data
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [bidAmount, setBidAmount] = useState('');

  // Modals
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isTcOpen, setIsTcOpen] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState({ name: '', imageUri: '', nftContract: '', tokenId: '', duration: '604800' });

  // --- Auto-Close Modal Logic ---
  useEffect(() => {
    if (account) setIsWalletModalOpen(false);
  }, [account]);

  // --- Init ---
  const init = useCallback(async () => {
    if (!window.ethereum) return;
    const provider = new BrowserProvider(window.ethereum);
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

    try {
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();
      const bal = await provider.getBalance(userAddr);
      setAccount(userAddr);
      setBalance(Number(formatEther(bal)).toFixed(3));

      // Fetch Auctions
      const count = await contract.auctionCount();
      const fetchedAuctions: AuctionData[] = [];
      
      for (let i = 0; i < Number(count); i++) {
        const a = await contract.auctions(i);
        fetchedAuctions.push({
          id: Number(a[0]),
          creator: a[1],
          name: a[2],
          imageUri: a[3],
          nftContract: a[4],
          tokenId: Number(a[5]),
          endTime: Number(a[6]),
          isActive: a[7] && !a[8]
        });
      }
      setAuctions(fetchedAuctions.reverse());

      // FHEVM Setup
      const instance = await createInstance({ chainId: 11155111 });
      setFhevm(instance);
    } catch (e) { console.error("Init Error:", e); }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setAuctions(prev => prev.map(a => {
        const now = Math.floor(Date.now() / 1000);
        const diff = a.endTime - now;
        let timeStr = "Ended";
        if (diff > 0) {
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          timeStr = `${h}h ${m}m`;
        }
        return { ...a, timeLeft: timeStr };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Install MetaMask");
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    init();
  };

  const handleCreate = async () => {
    if (!account) return alert("Connect Wallet");
    setIsLoading(true);
    setStatus("Verifying Ownership...");
    
    try {
      const provider = new BrowserProvider(window.ethereum);
      
      if (createForm.nftContract.length > 10) {
        const nftParams = new Contract(createForm.nftContract, ERC721_ABI, provider);
        try {
          const owner = await nftParams.ownerOf(createForm.tokenId);
          if (owner.toLowerCase() !== account.toLowerCase()) {
            throw new Error("You do not own this NFT.");
          }
        } catch (e) {
          alert("Ownership verification failed! Are you sure you own this Token ID?");
          setIsLoading(false);
          return;
        }
      }

      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      setStatus("Creating Auction on-chain...");
      
      const tx = await contract.createAuction(
        createForm.name,
        createForm.imageUri,
        createForm.nftContract,
        Number(createForm.tokenId),
        Number(createForm.duration)
      );
      await tx.wait();
      setStatus("Auction Created!");
      setView('gallery');
      init();
    } catch (e) {
      console.error(e);
      setStatus("Creation Failed.");
    }
    setIsLoading(false);
  };

  const handleBid = async () => {
    if (!fhevm || !account || !selectedAuction) return;
    setIsLoading(true);
    setStatus("Encrypting Bid...");
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const input = fhevm.createEncryptedInput(CONTRACT_ADDRESS, account);
      input.add32(Number(bidAmount));
      const encryptedData = input.encrypt();

      setStatus("Submitting to Blockchain...");
      const tx = await contract.bid(selectedAuction.id, encryptedData.handles[0], encryptedData.inputProof);
      await tx.wait();
      setStatus("Bid Placed Successfully!");
      setBidAmount('');
    } catch (e) {
      console.error(e);
      setStatus("Bid Failed.");
    }
    setIsLoading(false);
  };

  const handleEnd = async (cancel: boolean) => {
    if (!selectedAuction) return;
    setIsLoading(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = cancel 
        ? await contract.cancelAuction(selectedAuction.id)
        : await contract.endAuction(selectedAuction.id);
      await tx.wait();
      setStatus(cancel ? "Auction Cancelled" : "Auction Ended");
      setView('gallery');
      init();
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-yellow-500 selection:text-black flex flex-col relative">
      <style jsx global>{`input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; }`}</style>

      {/* WALLET MODAL */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 relative">
            <button onClick={() => setIsWalletModalOpen(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white cursor-pointer"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-bold text-center mb-6">Connect Wallet</h3>
            <button onClick={connectWallet} className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 mb-3 transition-colors cursor-pointer group">
              <span className="font-bold">MetaMask</span>
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors"><img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-5 h-5"/></div>
            </button>
            <div className="mt-6 pt-6 border-t border-neutral-800 text-center text-xs text-neutral-500">By connecting, you agree to our <button onClick={() => setIsTcOpen(true)} className="underline hover:text-white cursor-pointer">Terms & Conditions</button></div>
          </div>
        </div>
      )}

      {/* T&C MODAL */}
      {isTcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 rounded-t-2xl sticky top-0"><h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-400"/> Terms of Service</h3><button onClick={() => setIsTcOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer"><X className="w-6 h-6" /></button></div>
            <div className="p-8 overflow-y-auto text-neutral-300 space-y-6 leading-relaxed">
              <section><h4 className="text-white font-bold text-lg mb-2">1. Protocol Usage</h4><p>ShadowBid operates on the Sepolia Testnet. Assets are for testing only.</p></section>
              <section><h4 className="text-white font-bold text-lg mb-2">2. Single Auction Model</h4><p>This protocol supports multiple active auctions. Bids are binding and encrypted.</p></section>
            </div>
            <div className="p-6 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl"><button onClick={() => setIsTcOpen(false)} className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all cursor-pointer">I Understand & Agree</button></div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('gallery')}>
            <Shield className="w-6 h-6 text-yellow-400" />
            <span className="font-bold text-xl tracking-tight">Shadow<span className="text-yellow-400">Bid</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView('create')} className="hidden md:flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer"><PlusCircle className="w-4 h-4" /> Create Auction</button>
            {!account ? (
              <button onClick={() => setIsWalletModalOpen(true)} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2 rounded-full text-sm transition-all cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-95">Connect</button>
            ) : (
              <div className="flex items-center gap-3 bg-neutral-800 rounded-full pl-3 pr-4 py-1.5 border border-neutral-700 cursor-pointer hover:border-yellow-400/30 transition-colors">
                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500"></div>
                <span className="text-sm font-mono">{account.slice(0,6)}...</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex-grow">
        
        {/* VIEW: GALLERY */}
        {view === 'gallery' && (
          <div className="animate-in fade-in duration-500">
            {/* HERO */}
            <div className="text-center mb-16 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/5 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-400/10"><Lock className="w-3 h-3" /> FHE Privacy Layer</div>
              <h1 className="text-6xl font-extrabold tracking-tight">Bid in the <span className="bg-gradient-to-r from-yellow-200 to-yellow-500 bg-clip-text text-transparent">Shadows</span>. <br/> Win in the <span className="text-white">Light</span>.</h1>
              <p className="text-neutral-400 text-xl max-w-2xl mx-auto leading-relaxed">The decentralized auction house where bids are encrypted. True price discovery without the sniping.</p>
              
              {/* STATS BAR */}
              <div className="grid grid-cols-3 max-w-2xl mx-auto mt-8 border-t border-b border-neutral-800 py-4">
                <div><p className="text-2xl font-bold text-white">{auctions.filter(a => a.isActive).length}</p><p className="text-xs text-neutral-500 uppercase tracking-wider">Active Auctions</p></div>
                <div className="border-l border-r border-neutral-800"><p className="text-2xl font-bold text-white">Sepolia</p><p className="text-xs text-neutral-500 uppercase tracking-wider">Network</p></div>
                <div><p className="text-2xl font-bold text-white">Zama</p><p className="text-xs text-neutral-500 uppercase tracking-wider">Encryption</p></div>
              </div>
            </div>
            
            {auctions.length === 0 ? (
              <div className="text-center py-24 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-600"><Search className="w-8 h-8"/></div>
                <h3 className="text-xl font-bold text-white mb-2">No Active Auctions</h3>
                <p className="text-neutral-500 mb-6">The marketplace is currently quiet. Be the first to list an asset.</p>
                <button onClick={() => setView('create')} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-yellow-400/10 active:scale-95">Create First Auction</button>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {auctions.map((auc) => (
                  <div key={auc.id} onClick={() => { setSelectedAuction(auc); setView('view_auction'); }} className="group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-yellow-400/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-yellow-400/5 hover:-translate-y-1">
                    <div className="h-56 overflow-hidden relative bg-neutral-800">
                      <img src={auc.imageUri} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-mono border border-white/10 flex items-center gap-1"><Clock className="w-3 h-3 text-yellow-400"/> {auc.timeLeft}</div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-bold text-lg text-white mb-1 truncate">{auc.name}</h3>
                      <p className="text-neutral-500 text-xs mb-4 flex items-center gap-1"><User className="w-3 h-3"/> {auc.creator.slice(0,6)}...{auc.creator.slice(-4)}</p>
                      <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${auc.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {auc.isActive ? 'Live' : 'Ended'}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-yellow-400 group-hover:text-black transition-colors"><ChevronRight className="w-4 h-4" /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* HOW IT WORKS SECTION */}
            <div className="mt-24 pt-16 border-t border-neutral-800">
              <h2 className="text-3xl font-bold text-center mb-12">How ShadowBid Works</h2>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="p-6 rounded-2xl bg-neutral-900/50 border border-neutral-800">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-400"><EyeOff className="w-6 h-6"/></div>
                  <h3 className="text-xl font-bold mb-2">1. Encrypted Bids</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">Bids are encrypted on your device before they ever reach the blockchain. Miners and validators only see gibberish.</p>
                </div>
                <div className="p-6 rounded-2xl bg-neutral-900/50 border border-neutral-800">
                  <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center mb-4 text-yellow-400"><Zap className="w-6 h-6"/></div>
                  <h3 className="text-xl font-bold mb-2">2. Blind Calculation</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">The smart contract uses Homomorphic Encryption to mathematically compare bids and find the highest one without decrypting them.</p>
                </div>
                <div className="p-6 rounded-2xl bg-neutral-900/50 border border-neutral-800">
                  <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4 text-green-400"><Activity className="w-6 h-6"/></div>
                  <h3 className="text-xl font-bold mb-2">3. Fair Settlement</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">The winner is revealed only after the auction ends. This prevents price manipulation and front-running.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: CREATE */}
        {view === 'create' && (
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <button onClick={() => setView('gallery')} className="flex items-center gap-2 text-neutral-500 hover:text-white mb-6 cursor-pointer group"><ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Back</button>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">List Your Asset</h2>
              <div className="space-y-5">
                <div><label className="text-sm font-bold text-neutral-400">Name</label><input className="w-full bg-black border border-neutral-800 rounded-lg p-3 mt-1 focus:border-yellow-400 transition-colors outline-none" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="Item Name"/></div>
                <div><label className="text-sm font-bold text-neutral-400">Image URL</label><input className="w-full bg-black border border-neutral-800 rounded-lg p-3 mt-1 focus:border-yellow-400 transition-colors outline-none" value={createForm.imageUri} onChange={e => setCreateForm({...createForm, imageUri: e.target.value})} placeholder="https://..."/></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-bold text-neutral-400">Contract</label><input className="w-full bg-black border border-neutral-800 rounded-lg p-3 mt-1 focus:border-yellow-400 transition-colors outline-none" value={createForm.nftContract} onChange={e => setCreateForm({...createForm, nftContract: e.target.value})} placeholder="0x..."/></div>
                  <div><label className="text-sm font-bold text-neutral-400">Token ID</label><input type="number" className="w-full bg-black border border-neutral-800 rounded-lg p-3 mt-1 focus:border-yellow-400 transition-colors outline-none" value={createForm.tokenId} onChange={e => setCreateForm({...createForm, tokenId: e.target.value})} placeholder="1"/></div>
                </div>
                <button onClick={handleCreate} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-3 rounded-xl mt-4 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-95">{isLoading ? "Verifying..." : "Verify Ownership & List"}</button>
                <p className="text-center text-xs text-neutral-500 mt-2">{status}</p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SINGLE AUCTION */}
        {view === 'view_auction' && selectedAuction && (
          <div className="animate-in fade-in duration-500">
            <button onClick={() => setView('gallery')} className="flex items-center gap-2 text-neutral-500 hover:text-white mb-6 cursor-pointer group"><ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Back to Gallery</button>
            <div className="grid md:grid-cols-2 gap-12">
              <div className="rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 h-[500px] relative">
                <img src={selectedAuction.imageUri} className="w-full h-full object-cover" />
                <div className="absolute top-4 right-4"><button className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-white hover:text-black transition-colors cursor-pointer"><Share2 className="w-5 h-5"/></button></div>
              </div>
              <div className="flex flex-col justify-center space-y-6">
                <div>
                  <h1 className="text-4xl font-extrabold mb-2">{selectedAuction.name}</h1>
                  <p className="text-neutral-400 flex items-center gap-2 text-sm">Created by <span className="font-mono text-yellow-400 px-2 py-1 bg-yellow-400/10 rounded">{selectedAuction.creator.slice(0,6)}...{selectedAuction.creator.slice(-4)}</span></p>
                </div>

                <div className="bg-neutral-900 p-8 rounded-2xl border border-neutral-800 shadow-xl">
                  <div className="flex justify-between mb-8 pb-6 border-b border-neutral-800">
                    <div><span className="text-neutral-500 uppercase text-xs font-bold tracking-wider block mb-1">Status</span>{selectedAuction.isActive ? <span className="text-green-400 font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/> Live Now</span> : <span className="text-red-400 font-bold">Ended</span>}</div>
                    <div className="text-right"><span className="text-neutral-500 uppercase text-xs font-bold tracking-wider block mb-1">Time Remaining</span><span className="font-mono text-2xl font-bold text-white">{selectedAuction.timeLeft}</span></div>
                  </div>
                  
                  {selectedAuction.isActive ? (
                    <div className="space-y-6">
                      <div className="relative"><input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-2xl font-bold outline-none focus:border-yellow-400/50 transition-colors" placeholder="0.00" /><span className="absolute right-4 top-5 text-sm text-neutral-500 font-bold">ETH</span></div>
                      <button onClick={handleBid} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-[0.98] transition-transform">{isLoading ? "Encrypting..." : <>Place Private Bid <Lock className="w-4 h-4"/></>}</button>
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-neutral-800/50 rounded-lg text-neutral-400">Auction Closed</div>
                  )}
                  <p className="text-center text-xs text-neutral-600 mt-4">{status}</p>
                </div>

                {/* OWNER CONTROLS */}
                {account?.toLowerCase() === selectedAuction.creator.toLowerCase() && selectedAuction.isActive && (
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => handleEnd(false)} disabled={isLoading} className="bg-green-900/30 hover:bg-green-900/50 text-green-400 py-3 rounded-xl font-bold border border-green-900/50 transition-colors cursor-pointer">End Auction</button>
                    <button onClick={() => handleEnd(true)} disabled={isLoading} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 py-3 rounded-xl font-bold border border-red-900/50 transition-colors flex items-center justify-center gap-2 cursor-pointer"><Trash2 className="w-4 h-4"/> Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-neutral-800 py-8 mt-12 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-neutral-500 gap-4">
          <div className="flex items-center gap-6">
            <p>&copy; 2025 ShadowBid.</p>
            <button onClick={() => setIsTcOpen(true)} className="hover:text-white transition-colors cursor-pointer">Terms & Conditions</button>
          </div>
          <a href="https://x.com/0xshinkai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-yellow-400 transition duration-300 group cursor-pointer">by <span className="font-bold text-neutral-300 group-hover:text-yellow-400">0xshinkai</span><ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" /></a>
        </div>
      </footer>
    </div>
  );
}
