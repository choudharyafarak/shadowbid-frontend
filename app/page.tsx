'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, formatEther, JsonRpcProvider, hexlify } from 'ethers';
import {
  Shield, Lock, Wallet, ChevronRight, Gavel, Clock, Trophy, ExternalLink, User, X, FileText,
  PlusCircle, Search, Share2, ArrowLeft, Trash2, Zap, EyeOff, Activity
} from 'lucide-react';

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0xc082c1cf4466308dc3fc82d0D36Ac1FB09977D83";
const READ_ONLY_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const PUBLIC_RELAYER = process.env.NEXT_PUBLIC_ZAMA_RELAYER ?? "https://relayer.testnet.zama.org";
const KMS_ADDR = process.env.NEXT_PUBLIC_FHEVM_KMS ?? "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A";
const ACL_ADDR = process.env.NEXT_PUBLIC_FHEVM_ACL ?? "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D";

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

// Fixed SDK Loader: Only uses fhevmjs to prevent build errors
async function loadRelayerCreateInstance() {
  try {
    const sdk = await import('fhevmjs');
    return sdk.createInstance;
  } catch (e) {
    console.error("Failed to load fhevmjs", e);
    throw new Error('fhevmjs not installed.');
  }
}

async function checkRelayerPublicKey(relayerUrl: string) {
  try {
    const url = relayerUrl.replace(/\/+$/, '') + '/public_key';
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error(`Public key fetch failed: ${resp.status}`);
    return true;
  } catch (e) {
    console.warn("Relayer check failed:", e);
    // We don't throw here to allow app to load, but encryption might fail later
    return false;
  }
}

export default function ShadowBidMarketplace() {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0.00');
  const [fhevm, setFhevm] = useState<any | null>(null);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'gallery' | 'create' | 'view_auction'>('gallery');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [auctions, setAuctions] = useState<AuctionData[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isTcOpen, setIsTcOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', imageUri: '', nftContract: '', tokenId: '', duration: '604800' });

  const selectedAuction = auctions.find(a => a.id === selectedId) || null;

  useEffect(() => { if (account) setIsWalletModalOpen(false); }, [account]);

  const init = useCallback(async () => {
    try {
      let readProvider;
      // Using 'as any' to bypass TypeScript errors if global.d.ts is missing
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        readProvider = new BrowserProvider((window as any).ethereum);
      } else {
        readProvider = new JsonRpcProvider(READ_ONLY_RPC);
      }

      const contract = new Contract(CONTRACT_ADDRESS, ABI, readProvider);

      try {
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
      } catch (e) {
        console.warn('Contract read failed', e);
        setAuctions([]);
      }

      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const browserProvider = new BrowserProvider((window as any).ethereum);
          const accounts = await browserProvider.send("eth_accounts", []);
          if (accounts.length > 0) {
            const signer = await browserProvider.getSigner();
            const userAddr = await signer.getAddress();
            const bal = await browserProvider.getBalance(userAddr);
            setAccount(userAddr);
            setBalance(Number(formatEther(bal)).toFixed(3));
          }
        } catch (e) {
          console.warn('Wallet read init failed:', e);
        }

        try {
          const createInstance = await loadRelayerCreateInstance();
          // we attempt non-blocking init with public relayer
          await checkRelayerPublicKey(PUBLIC_RELAYER);
          const instance = await createInstance({
            chainId: 11155111,
            wallet: (window as any).ethereum,
            kmsContractAddress: KMS_ADDR,
            aclContractAddress: ACL_ADDR,
            gatewayUrl: PUBLIC_RELAYER,
            networkUrl: READ_ONLY_RPC
          });
          setFhevm(instance);
        } catch (e) {
          console.warn('FHEVM init (deferred)', e);
        }
      }
    } catch (e) {
      console.error('Init Error:', e);
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam && auctions.length > 0) {
      const id = Number(idParam);
      if (auctions.find(a => a.id === id)) {
        setSelectedId(id);
        setView('view_auction');
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
    if (!(window as any).ethereum) return alert("Please install MetaMask.");
    try {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) alert("Please add Sepolia network to MetaMask");
      }
      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      init();
    } catch (e) { console.error(e); setStatus('Wallet connection failed'); }
  };

  const handleShare = (id: number) => {
    const url = `${window.location.origin}?id=${id}`;
    navigator.clipboard.writeText(url);
    alert("Unique link copied!");
  };

  const handleCreate = async () => {
    if (!account) return setIsWalletModalOpen(true);
    setIsLoading(true);
    setStatus("Verifying...");
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      if (createForm.nftContract.length > 10) {
        try {
          const nftParams = new Contract(createForm.nftContract, ERC721_ABI, provider);
          const owner = await nftParams.ownerOf(createForm.tokenId);
          if (owner.toLowerCase() !== account.toLowerCase()) throw new Error();
        } catch {
          alert("Ownership verification failed! You must own the NFT to list it.");
          setIsLoading(false);
          return;
        }
      }

      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      setStatus("Creating Auction...");
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
      setStatus("Failed.");
    }
    setIsLoading(false);
  };

  const handleBid = async () => {
    if (!account) return setIsWalletModalOpen(true);
    if (!selectedAuction) return;

    setIsLoading(true);
    setStatus("Checking Security Layer...");

    try {
      let instance = fhevm;

      if (!instance) {
        setStatus("Initializing Zama Encryption...");
        try {
          // Ensure public relayer key reachable
          await checkRelayerPublicKey(PUBLIC_RELAYER);

          const createInstance = await loadRelayerCreateInstance();
          instance = await createInstance({
            chainId: 11155111,
            wallet: (window as any).ethereum,
            kmsContractAddress: KMS_ADDR,
            aclContractAddress: ACL_ADDR,
            gatewayUrl: PUBLIC_RELAYER,
            networkUrl: READ_ONLY_RPC
          });
          setFhevm(instance);
        } catch (e) {
          console.error("FHEVM Init Failed:", e);
          alert("Security Layer Failed. Check console.");
          setIsLoading(false);
          return;
        }
      }

      const rawAmount = parseFloat(bidAmount);
      if (isNaN(rawAmount) || rawAmount <= 0) {
        alert("Please enter a valid bid amount.");
        setIsLoading(false);
        return;
      }
      const scaledAmount = Math.floor(rawAmount * 100);

      setStatus("Encrypting Bid...");
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, account);

      if (typeof input.add32 === 'function') {
        input.add32(scaledAmount);
      } else if (typeof input.addUint === 'function') {
        input.addUint(BigInt(scaledAmount));
      } else if (typeof input.add === 'function') {
        input.add(BigInt(scaledAmount));
      } else {
        throw new Error('Encrypted input API not found (add/add32/addUint)');
      }

      // FIXED: Added await and type casting
      const encryptedData: any = await input.encrypt();
      console.log('Encrypted data:', encryptedData);

      const handles = encryptedData.handles ?? encryptedData.ciphertext ?? null;
      const proof = encryptedData.inputProof ?? encryptedData.proof ?? null;
      if (!handles || !proof) {
        console.error('Encryption returned no handles/proof', encryptedData);
        throw new Error('Encryption failed: missing handles/proof');
      }

      const firstHandle = Array.isArray(handles) ? handles[0] : handles;
      let handleArg: any = firstHandle;
      try {
        handleArg = typeof firstHandle === 'string' ? firstHandle : hexlify(firstHandle);
      } catch (hErr) {
        console.warn('hexlify failed, passing raw handle;', hErr);
        handleArg = firstHandle;
      }

      setStatus("Submitting to Blockchain...");
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await contract.bid(
        selectedAuction.id,
        handleArg,
        proof,
        { gasLimit: 10000000 }
      );

      setStatus("Mining Transaction...");
      await tx.wait();
      setStatus("Bid Placed Successfully!");
      setBidAmount('');
      init();
    } catch (e) {
      console.error(e);
      setStatus("Bid Failed. Check Console.");
      alert("Bid failed — check console for details.");
    }
    setIsLoading(false);
  };

  const handleEnd = async (cancel: boolean) => {
    if (!selectedAuction) return;
    setIsLoading(true);
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = cancel
        ? await contract.cancelAuction(selectedAuction.id)
        : await contract.endAuction(selectedAuction.id);
      await tx.wait();
      setStatus(cancel ? "Cancelled" : "Ended");
      setView('gallery');
      init();
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-yellow-500 selection:text-black flex flex-col relative">
      <style jsx global>{`input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; }`}</style>

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
            </div>
          </div>
        </div>
      )}

      {isTcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in cursor-default">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 rounded-t-2xl sticky top-0 z-10">
              <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-400"/> Terms of Service</h3>
              <button onClick={() => setIsTcOpen(false)} className="text-neutral-500 hover:text-white cursor-pointer bg-neutral-800 p-1 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-8 overflow-y-auto text-neutral-300 space-y-8 leading-relaxed">
              <section><h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400"/> 1. Testnet Protocol</h4><p>ShadowBid operates exclusively on the Sepolia Testnet.</p></section>
              <section><h4 className="text-white font-bold text-lg mb-2 flex items-center gap-2"><Lock className="w-4 h-4 text-green-400"/> 2. Encryption & Privacy</h4><p>We use Zama's fhEVM technology to encrypt bid values.</p></section>
            </div>
            <div className="p-6 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl"><button onClick={() => setIsTcOpen(false)} className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all cursor-pointer shadow-lg active:scale-[0.99]">I Understand & Agree</button></div>
          </div>
        </div>
      )}

      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setView('gallery'); setSelectedId(null); }}><Shield className="w-8 h-8 text-yellow-400 group-hover:rotate-12 transition-transform" /><span className="font-bold text-2xl tracking-tight text-white group-hover:text-yellow-50 transition-colors">Shadow<span className="text-yellow-400">Bid</span></span></div>
          <div className="flex items-center gap-4">
            <button onClick={() => setView('create')} className="hidden md:flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer bg-neutral-800/50 hover:bg-neutral-800 px-4 py-2 rounded-full border border-transparent hover:border-neutral-700"><PlusCircle className="w-4 h-4" /> Create Auction</button>
            {!account ? (
              <button onClick={() => setIsWalletModalOpen(true)} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-6 py-2 rounded-full text-sm transition-all cursor-pointer shadow-[0_0_20px_rgba(250,204,21,0.3)]">Connect Wallet</button>
            ) : (
              <div className="flex items-center gap-3 bg-neutral-900 rounded-full pl-1 pr-4 py-1 border border-neutral-800 cursor-pointer hover:border-yellow-400/30 transition-colors shadow-lg"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-600 flex items-center justify-center text-black font-bold text-xs shadow-inner">{account.slice(2,4)}</div><div className="flex flex-col"><span className="text-xs font-bold text-white leading-none">{account.slice(0,6)}...</span><span className="text-[10px] text-neutral-500 font-mono leading-none mt-1">{balance} ETH</span></div></div>
            )}
          </div>
        </div>
      </nav>

     <main className="max-w-6xl mx-auto px-6 py-12 flex-grow">
        {view === 'gallery' && (
          <div className="animate-in fade-in duration-500">
            <div className="text-center mb-16 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.1)]"><Lock className="w-3 h-3" /> FHE Privacy Layer</div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">Bid in the <span className="bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent">Shadows</span>. <br/> Win in the <span className="text-white">Light</span>.</h1>
              
              <div className="grid grid-cols-2 md:grid-cols-4 max-w-4xl mx-auto mt-12 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
                <div className="text-center p-2"><p className="text-3xl font-bold text-white">{auctions.length}</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">Total Auctions</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-white">{auctions.filter(a => a.isActive).length}</p><p className="text-xs text-nutral-500 uppercase tracking-wider font-bold mt-1">Live Now</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-white">Sepolia</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">Network</p></div>
                <div className="text-center p-2 border-l border-neutral-800"><p className="text-3xl font-bold text-green-400">Online</p><p className="text-xs text-neutral-500 uppercase tracking-wider font-bold mt-1">System Status</p></div>
              </div>
            </div>
            
            {auctions.length === 0 ? (
              <div className="py-20 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/10 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-900/50 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6 text-neutral-600 shadow-2xl"><Search className="w-10 h-10"/></div>
                  <h3 className="text-2xl font-bold text-white mb-2">No Active Auctions</h3>
                  <button onClick={() => setView('create')} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-4 rounded-xl transition-all cursor-pointer shadow-xl shadow-yellow-400/20 active:scale-95 flex items-center gap-2 mx-auto"><PlusCircle className="w-5 h-5"/> Create First Auction</button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-8">
                {auctions.map((auc) => (
                  <div key={auc.id} onClick={() => { setSelectedId(auc.id); setView('view_auction'); }} className="group bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden hover:border-yellow-400/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-yellow-400/10 hover:-translate-y-2 flex flex-col">
                    <div className="h-64 overflow-hidden relative bg-neutral-800">
                      <img src={auc.imageUri} className="w-full h-full object-cover group-hover:scale-110 transition duration-700 ease-out" />
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-mono border border-white/10 flex items-center gap-2 shadow-lg"><Clock className="w-3 h-3 text-yellow-400"/> {auc.timeLeft}</div>
                    </div>
                    <div className="p-6 flex-grow flex flex-col">
                      <h3 className="font-bold text-xl text-white mb-1 truncate">{auc.name}</h3>
                      <p className="text-neutral-500 text-xs mb-6 flex items-center gap-1 font-mono"><User className="w-3 h-3"/> {auc.creator.slice(0,6)}...{auc.creator.slice(-4)}</p>
                      <div className="mt-auto flex justify-between items-center pt-4 border-t border-neutral-800">
                        <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wide ${auc.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-neutral-800 text-neutral-500 border border-neutral-700'}`}>{auc.isActive ? 'Live Now' : 'Ended'}</span>
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center group-hover:bg-yellow-400 group-hover:text-black transition-all shadow-md"><ChevronRight className="w-5 h-5" /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'create' && (
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <button onClick={() => setView('gallery')} className="flex items-center gap-2 text-neutral-500 hover:text-white mb-6 cursor-pointer group px-4 py-2 rounded-lg hover:bg-neutral-800 transition-all"><ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform"/> Back to Gallery</button>
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <h2 className="text-3xl font-bold mb-2 text-white">List Your Asset</h2>
              <div className="space-y-6">
                <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Item Name</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 outline-none" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} placeholder="e.g. Genesis Cube"/></div>
                <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Image URL</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 outline-none" value={createForm.imageUri} onChange={e => setCreateForm({...createForm, imageUri: e.target.value})} placeholder="https://..."/></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Contract</label><input className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 outline-none" value={createForm.nftContract} onChange={e => setCreateForm({...createForm, nftContract: e.target.value})} placeholder="0x..."/></div>
                  <div><label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Token ID</label><input type="number" className="w-full bg-black border border-neutral-800 rounded-xl p-4 text-white focus:border-yellow-400 outline-none" value={createForm.tokenId} onChange={e => setCreateForm({...createForm, tokenId: e.target.value})} placeholder="1"/></div>
                </div>
                <button onClick={handleCreate} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-xl mt-6 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-95 text-lg">{isLoading ? "Verifying..." : "Verify Ownership & List"}</button>
                <p className="text-center text-xs text-neutral-500 mt-4">{status}</p>
              </div>
            </div>
          </div>
        )}

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
                      <button onClick={handleBid} disabled={isLoading} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer shadow-xl shadow-yellow-400/20 active:scale-[0.98] transition-all text-lg">{isLoading ? status || "Encrypting..." : <>Place Private Bid <Lock className="w-5 h-5"/></>}</button>
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
            <a href="https://docs.zama.org" target="_blank" rel="noreferrer" className="hover:text-white transition-colors cursor-pointer font-medium hover:underline">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
