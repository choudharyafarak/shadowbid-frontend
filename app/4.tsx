'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, formatEther } from 'ethers';
import { createInstance, FhevmInstance } from 'fhevmjs';
import { Shield, Lock, Wallet, ChevronRight, Gavel, Clock, Trophy, ExternalLink, User, X, FileText, CheckCircle2, PlusCircle, Search, Share2, ArrowLeft, Trash2, Zap, EyeOff, Activity } from 'lucide-react';

const CONTRACT_ADDRESS = "0xc082c1cf4466308dc3fc82d0D36Ac1FB09977D83";

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
  
  const [view, setView] = useState('gallery');
  // Store ID instead of object to prevent stale data
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [bidAmount, setBidAmount] = useState('');

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isTcOpen, setIsTcOpen] = useState(false);

  const [createForm, setCreateForm] = useState({ name: '', imageUri: '', nftContract: '', tokenId: '', duration: '604800' });

  // Derived state for the active view
  const selectedAuction = auctions.find(a => a.id === selectedId) || null;

  // Auto-Close Wallet Modal
  useEffect(() => {
    if (account) setIsWalletModalOpen(false);
  }, [account]);

  const init = useCallback(async () => {
    if (!window.ethereum) return;
    const provider = new BrowserProvider(window.ethereum);
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

    try {
      // Try to get signer if available (for balance), otherwise just read data
      let userAddr = null;
      try {
        const signer = await provider.getSigner();
        userAddr = await signer.getAddress();
        const bal = await provider.getBalance(userAddr);
        setAccount(userAddr);
        setBalance(Number(formatEther(bal)).toFixed(3));
      } catch (e) {
        console.log("Wallet not connected yet, loading read-only data.");
      }

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

      // Only init FHEVM if we have a signer (needed for encrypting)
      if (userAddr) {
        const instance = await createInstance({ chainId: 11155111 });
        setFhevm(instance);
      }
    } catch (e) { console.error("Init Error:", e); }
  }, []);

  // Initial Load & Deep Link Logic
  useEffect(() => {
    init();
  }, [init]);

  // Handle Deep Linking (Opening a specific auction via URL)
  useEffect(() => {
    if (auctions.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get('id');
      if (idParam) {
        const id = Number(idParam);
        const target = auctions.find(a => a.id === id);
        if (target) {
          setSelectedId(id);
          setView('view_auction');
        }
      }
    }
  }, [auctions]);

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

  const handleShare = (id: number) => {
    const url = `${window.location.protocol}//${window.location.host}?id=${id}`;
    navigator.clipboard.writeText(url);
    alert("Unique auction link copied to clipboard!");
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in cursor-default">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 relative shadow-2xl">
            <button onClick={() => setIsWalletModalOpen(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white cursor-pointer"><X className="w-5 h-5"/></button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-neutral-800 rounded-2xl mx-auto flex items-center justify-center mb-4 text-yellow-400 shadow-lg shadow-yellow-400/10"><Wallet className="w-8 h-8" /></div>
              <h3 className="text-2xl font-bold text-white">Connect Wallet</h3>
              <p className="text-neutral-400 text-sm mt-2">Secure connection to Sepolia Network</p>
            </div>
            <div className="space-y-3">
              <button onClick={connectWallet} className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-orange-500/50 transition-all cursor-pointer group shadow-lg">
                <span className="font-bold text-lg group-hover:text-orange-400 transition-colors">MetaMask</span>
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1"><img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-full h-full"/></div>
              </button>
              <button onClick={connectWallet} className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-blue-500/50 transition-all cursor-pointer group shadow-lg">
                <span className="font-bold text-lg group-hover:text-blue-400 transition-colors">Browser Wallet</span>
                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center"><Wallet className="w-5 h-5"/></div>
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-neutral-800 text-center text-xs text-neutral-500">By connecting, you agree to our <button onClick={() => { setIsWalletModalOpen(false); setIsTcOpen(true); }} className="underline hover:text-white cursor-pointer transition-colors">Terms & Conditions</button></div>
          </div>
        </div>
      )}

      {/* T&C MODAL */}
      {isTcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in cursor-default">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 rounded-t-2xl sticky top-0 z-10">
              <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-400"/> Terms of Service</h3>
              <button onClick={() => setIsTcOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer bg-neutral-800 p-1 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-8 overflow-y-auto text-neutral-300 space-y-8 leading-relaxed">
              <section>
                <h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400"/> 1. Testnet Protocol</h4>
                <p>ShadowBid operates exclusively on the <strong>Sepolia Testnet</strong>. All assets, tokens, and currencies used within this application are for testing and demonstration purposes only. They hold no real-world monetary value.</p>
              </section>
              <section>
                <h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-green-400"/> 2. Encryption & Privacy</h4>
                <p>We use Zama's fhEVM technology to encrypt bid values. While the amounts are hidden, transaction metadata (sender address, timestamp) is public on the blockchain.</p>
              </section>
              <section>
                <h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2"><Gavel className="w-4 h-4 text-yellow-400"/> 3. Finality</h4>
                <p>Auction results are determined mathematically by the smart contract. Once a winner is declared or an auction is finalized, the result is irreversible.</p>
              </section>
            </div>
            <div className="p-6 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl">
              <button onClick={() => setIsTcOpen(false)} className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-yellow-400/20 hover:scale-[1.01] active:scale-[0.99]">I Understand & Agree</button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setView('gallery'); setSelectedId(null); }}>
            <Shield className="w-8 h-8 text-yellow-400 group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-2xl tracking-tight text-white group-hover:text-yellow-50 transition-colors">Shadow<span className="text-yellow-400">Bid</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView('create')} className="hidden md:flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer bg-neutral-800/50 hover:bg-neutral-800 px-4 py-2 rounded-full border border-transparent hover:border-neutral-700"><PlusCircle className="w-4 h-4" /> Create Auction</button>
            {!account ? (
              <button onClick={() => setIsWalletModalOpen(true)} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-2 rounded-full text-sm transition-all cursor-pointer shadow-[0_0_20px_rgba(250,204,21,0.3)] hover:shadow-[0_0_30px_rgba(250,204,21,0.5)] active:scale-95">Connect Wallet</button>
            ) : (
              <div className="flex items-center gap-3 bg-neutral-900 rounded-full pl-1 pr-4 py-1 border border-neutral-800 cursor-pointer hover:border-yellow-400/30 transition-colors shadow-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-600 flex items-center justify-center text-black font-bold text-xs shadow-inner">{account.slice(2,4)}</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">{account.slice(0,6)}...</span>
                  <span className="text-[10px] text-neutral-500 font-mono leading-none mt-1">{balance} ETH</span>
                </div>
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
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.1)]"><Lock className="w-3 h-3" /> FHE Privacy Layer</div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
                Bid in the <span className="bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent">Shadows</span>. <br/> 
                Win in the <span className="text-white">Light</span>.
              </h1>
              <p className="text-neutral-400 text-xl max-w-2xl mx-auto leading-relaxed">The first decentralized auction house where your strategy stays yours. Smart contracts verify the highest bidder without ever revealing the losing bids.</p>
              
              {/* PLATFORM STATS */}
              <div className="grid grid-cols-2 md:grid-cols-4 max-w-4xl mx-auto mt-12 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
                <div className="text-center p-2"><p className="text-3xl font-bold text-white">{auctions.length}</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">Total Auctions</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-white">{auctions.filter(a => a.isActive).length}</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">Live Now</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-white">Sepolia</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">Network</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-green-400">Online</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">System Status</p></div>
              </div>
            </div>
            
            {auctions.length === 0 ? (
              // ENHANCED EMPTY STATE
              <div className="py-20 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/10 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-900/50 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6 text-neutral-600 shadow-2xl"><Search className="w-10 h-10"/></div>
                  <h3 className="text-2xl font-bold text-white mb-2">No Active Auctions</h3>
                  <p className="text-neutral-500 mb-8 max-w-md mx-auto">The marketplace is currently quiet. This is your chance to set the floor price and list the first asset.</p>
                  <button onClick={() => setView('create')} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-4 rounded-xl transition-all cursor-pointer shadow-xl shadow-yellow-400/20 active:scale-95 flex items-center gap-2 mx-auto">
                    <PlusCircle className="w-5 h-5"/> Create First Auction
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-8">
                {auctions.map((auc) => (
                  <div key={auc.id} onClick={() => { setSelectedId(auc.id); setView('view_auction'); }} className="group bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden hover:border-yellow-400/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-yellow-400/10 hover:-translate-y-2 flex flex-col">
                    <div className="h-64 overflow-hidden relative bg-neutral-800">
                      <img src={auc.imageUri} className="w-full h-full object-cover group-hover:scale-110 transition duration-700 ease-out" />
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-mono border border-white/10 flex items-center gap-2 shadow-lg"><Clock className="w-3 h-3 text-yellow-400"/> {auc.timeLeft}</div>
                      {!auc.isActive && <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px]"><span className="text-white font-bold text-xl uppercase tracking-widest border-2 border-white px-4 py-2 rounded">Closed</span></div>}
                    </div>
                    <div className="p-6 flex-grow flex flex-col">
                      <h3 className="font-bold text-xl text-white mb-1 truncate">{auc.name}</h3>
                      <p className="text-neutral-500 text-xs mb-6 flex items-center gap-1 font-mono"><User className="w-3 h-3"/> {auc.creator.slice(0,6)}...{auc.creator.slice(-4)}</p>
                      <div className="mt-auto flex justify-between items-center pt-4 border-t border-neutral-800">
                        <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wide ${auc.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>
                          {auc.isActive ? 'Live Now' : 'Ended'}
                        </span>
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-yellow-400 group-hover:text-black transition-all shadow-md"><ChevronRight className="w-5 h-5" /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* INTERACTIVE INFO SECTION */}
            <div className="mt-32 pt-16 border-t border-neutral-800">
              <div className="flex flex-col md:flex-row justify-between items-end mb-12">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">Why ShadowBid?</h2>
                  <p className="text-neutral-400">The technology behind the privacy.</p>
                </div>
                <a href="https://docs.zama.org" target="_blank" className="text-yellow-400 hover:text-white transition-colors text-sm font-bold flex items-center gap-2 mt-4 md:mt-0 cursor-pointer">Read Documentation <ExternalLink className="w-4 h-4"/></a>
              </div>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="p-8 rounded-3xl bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-900 transition-colors cursor-default group">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform"><EyeOff className="w-7 h-7"/></div>
                  <h3 className="text-xl font-bold mb-3 text-white">Encrypted Inputs</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">Bids are encrypted on your device using FHE before they ever reach the blockchain. Even validators cannot see your bid amount.</p>
                </div>
                <div className="p-8 rounded-3xl bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-900 transition-colors cursor-default group">
                  <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center mb-6 text-yellow-400 group-hover:scale-110 transition-transform"><Zap className="w-7 h-7"/></div>
                  <h3 className="text-xl font-bold mb-3 text-white">Blind Computation</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">The smart contract compares encrypted values mathematically. It determines "A is larger than B" without knowing what A or B actually are.</p>
                </div>
                <div className="p-8 rounded-3xl bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-900 transition-colors cursor-default group">
                  <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 text-green-400 group-hover:scale-110 transition-transform"><Activity className="w-7 h-7"/></div>
                  <h3 className="text-xl font-bold mb-3 text-white">Verifiable Fairness</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">Unlike "Secret" centralized databases, this logic runs on-chain. Anyone can verify the code execution was tamper-proof.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: CREATE */}
        {view === 'create' && (
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <button onClick={() => setView('gallery')} className="flex items-center gap-2 text-neutral-500 hover:text-white mb-6 cursor-pointer group px-4 py-2 rounded-lg hover:bg-neutral-800 transition-all"><ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Back to Gallery</button>
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/5 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="text-3xl font-bold mb-2 text-white">List Your Asset</h2>
              <p className="text-neutral-400 text-sm mb-8">Set up a blind auction for your digital asset.</p>
              
              <div className="space-y-6">
                <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Item Name</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 transition-colors outline-none focus:ring-1 focus:ring-yellow-400" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="e.g. Genesis Cube"/></div>
                <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Image URL</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 transition-colors outline-none focus:ring-1 focus:ring-yellow-400" value={createForm.imageUri} onChange={e => setCreateForm({...createForm, imageUri: e.target.value})} placeholder="https://..."/></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Contract</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 transition-colors outline-none focus:ring-1 focus:ring-yellow-400" value={createForm.nftContract} onChange={e => setCreateForm({...createForm, nftContract: e.target.value})} placeholder="0x..."/></div>
                  <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Token ID</label><input type="number" className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 transition-colors outline-none focus:ring-1 focus:ring-yellow-400" value={createForm.tokenId} onChange={e => setCreateForm({...createForm, tokenId: e.target.value})} placeholder="1"/></div>
                </div>
                <button onClick={handleCreate} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-xl mt-6 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-95 text-lg">{isLoading ? "Verifying..." : "Verify Ownership & List"}</button>
                <p className="text-center text-xs text-neutral-500 mt-4">{status}</p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SINGLE AUCTION */}
        {view === 'view_auction' && selectedAuction && (
          <div className="animate-in fade-in duration-500">
            <button onClick={() => setView('gallery')} className="flex items-center gap-2 text-neutral-500 hover:text-white mb-6 cursor-pointer group px-4 py-2 rounded-lg hover:bg-neutral-800 transition-all"><ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Back to Gallery</button>
            <div className="grid md:grid-cols-2 gap-12">
              <div className="rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 h-[600px] relative shadow-2xl">
                <img src={selectedAuction.imageUri} className="w-full h-full object-cover" />
                <div className="absolute top-4 right-4"><button onClick={() => handleShare(selectedAuction.id)} className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-white hover:text-black transition-colors cursor-pointer shadow-lg group"><Share2 className="w-5 h-5"/></button></div>
              </div>
              <div className="flex flex-col justify-center space-y-8">
                <div>
                  <h1 className="text-5xl font-extrabold mb-3 text-white leading-tight">{selectedAuction.name}</h1>
                  <p className="text-neutral-400 flex items-center gap-2 text-sm bg-neutral-900 w-fit px-4 py-2 rounded-full border border-neutral-800"><User className="w-4 h-4 text-yellow-400"/> Created by <span className="font-mono text-white">{selectedAuction.creator.slice(0,6)}...{selectedAuction.creator.slice(-4)}</span></p>
                </div>

                <div className="bg-neutral-900 p-8 rounded-3xl border border-neutral-800 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                  
                  <div className="flex justify-between mb-8 pb-6 border-b border-neutral-800 relative z-10">
                    <div><span className="text-neutral-500 uppercase text-xs font-bold tracking-wider block mb-1">Status</span>{selectedAuction.isActive ? <span className="text-green-400 font-bold flex items-center gap-2 text-lg"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.8)]"/> Live Now</span> : <span className="text-red-400 font-bold text-lg">Ended</span>}</div>
                    <div className="text-right"><span className="text-neutral-500 uppercase text-xs font-bold tracking-wider block mb-1">Time Remaining</span><span className="font-mono text-3xl font-bold text-white tracking-tight">{selectedAuction.timeLeft}</span></div>
                  </div>
                  
                  {selectedAuction.isActive ? (
                    <div className="space-y-6 relative z-10">
                      <div>
                        <label className="text-neutral-400 text-sm font-bold mb-2 block">Your Encrypted Bid</label>
                        <div className="relative group">
                          <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="w-full bg-black border border-neutral-800 rounded-2xl p-5 text-3xl font-bold outline-none focus:border-yellow-400/50 transition-colors group-hover:border-neutral-700" placeholder="0.00" />
                          <span className="absolute right-6 top-6 text-lg text-neutral-500 font-bold">ETH</span>
                        </div>
                      </div>
                      <button onClick={handleBid} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer shadow-xl shadow-yellow-400/20 active:scale-[0.98] transition-all text-lg">{isLoading ? "Encrypting..." : <>Place Private Bid <Lock className="w-5 h-5"/></>}</button>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-neutral-800/30 rounded-2xl border border-neutral-800/50"><Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3"/><h3 className="text-xl font-bold text-white">Auction Closed</h3><p className="text-neutral-500 text-sm">Winner is being calculated on-chain.</p></div>
                  )}
                  <p className="text-center text-xs text-neutral-500 mt-6 font-mono">{status}</p>
                </div>

                {account?.toLowerCase() === selectedAuction.creator.toLowerCase() && selectedAuction.isActive && (
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => handleEnd(false)} disabled={isLoading} className="bg-green-500/10 hover:bg-green-500/20 text-green-400 py-4 rounded-2xl font-bold border border-green-500/20 transition-all cursor-pointer hover:shadow-lg hover:shadow-green-500/10 active:scale-95">End Auction</button>
                    <button onClick={() => handleEnd(true)} disabled={isLoading} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 py-4 rounded-2xl font-bold border border-red-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer hover:shadow-lg hover:shadow-red-500/10 active:scale-95"><Trash2 className="w-4 h-4"/> Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-neutral-800 py-10 mt-12 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-neutral-500 gap-6">
          <div className="flex items-center gap-8">
            <p>&copy; 2025 ShadowBid.</p>
            <button onClick={() => setIsTcOpen(true)} className="hover:text-white transition-colors cursor-pointer font-medium hover:underline">Terms & Conditions</button>
            <a href="https://docs.zama.org" target="_blank" className="hover:text-white transition-colors cursor-pointer font-medium hover:underline">Docs</a>
          </div>
          <a href="https://x.com/0xshinkai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-all duration-300 group cursor-pointer bg-neutral-800/50 px-4 py-2 rounded-full border border-neutral-700/50 hover:border-yellow-400/30 hover:bg-neutral-800">
            <span>Built by</span>
            <span className="font-bold text-neutral-300 group-hover:text-yellow-400 transition-colors">0xshinkai</span>
            <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-neutral-500 group-hover:text-yellow-400" />
          </a>
        </div>
      </footer>
    </div>
  );
}
