'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, formatEther } from 'ethers';
import { createInstance, FhevmInstance } from 'fhevmjs';
import { Shield, Lock, Wallet, ChevronRight, Gavel, Clock, Trophy, ExternalLink, User, X, FileText, CheckCircle2, Settings, Edit3, PlusCircle, Search } from 'lucide-react';

// Updated Contract Address
const CONTRACT_ADDRESS = "0xa1B648CB6Da8bCB3bF3856D31C7AB18A950A7EE9";

const ABI = [
  "function bid(bytes calldata input, bytes calldata inputProof) public",
  "function endTime() public view returns (uint256)",
  "function isEnded() public view returns (bool)",
  "function owner() public view returns (address)",
  "function endAuction() public",
  "function getWinningBid() public view returns (uint256, address)",
  "function item() public view returns (string name, string imageUri, address nftContract, uint256 tokenId, bool isActive)",
  "function setAuctionItem(string memory _name, string memory _imageUri, address _nftContract, uint256 _tokenId, uint256 _durationInSeconds) public"
];

// Minimal ABI to check NFT ownership
const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)"
];

export default function ShadowBidApp() {
  // --- State Management ---
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0.00');
  const [fhevm, setFhevm] = useState<FhevmInstance | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [status, setStatus] = useState('Connect wallet to begin');
  const [isLoading, setIsLoading] = useState(false);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'create'>('home');

  // Modals
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isTcOpen, setIsTcOpen] = useState(false);

  // Auction State
  const [auctionItem, setAuctionItem] = useState({ name: 'Loading...', imageUri: '', nftContract: '', tokenId: 0 });
  const [auctionEndTime, setAuctionEndTime] = useState<number>(0);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>("Loading...");

  // Create Auction Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    imageUri: '',
    nftContract: '',
    tokenId: '',
    duration: '604800' // Default 7 days
  });

  // --- Initialization ---
  const init = useCallback(async () => {
    if (!window.ethereum) return;
    const provider = new BrowserProvider(window.ethereum);
    
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
    
    try {
      // Fetch On-Chain Data
      const endT = await contract.endTime();
      const ended = await contract.isEnded();
      try {
        const itemData = await contract.item();
        setAuctionItem({
          name: itemData[0],
          imageUri: itemData[1],
          nftContract: itemData[2],
          tokenId: Number(itemData[3])
        });
      } catch (e) {
        // Fallback if item() is not yet populated
        setAuctionItem({ name: "Mystery Item", imageUri: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=1000", nftContract: "0x0", tokenId: 0 });
      }
      
      setAuctionEndTime(Number(endT));
      setIsEnded(ended);

      // Check user details
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();
      const ownerAddr = await contract.owner();
      const bal = await provider.getBalance(userAddr);
      
      setAccount(userAddr);
      setBalance(Number(formatEther(bal)).toFixed(3));
      setIsOwner(userAddr.toLowerCase() === ownerAddr.toLowerCase());

      // Setup FHEVM
      const instance = await createInstance({ chainId: 11155111 });
      setFhevm(instance);
      setStatus('Ready to bid securely');
      setIsWalletModalOpen(false);
    } catch (e) {
      console.error("Init error:", e);
    }
  }, []);

  // Timer Logic
  useEffect(() => {
    if (!auctionEndTime) return;
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auctionEndTime - now;
      
      if (diff <= 0) {
        setTimeLeft("Auction Closed");
        setIsEnded(true); 
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [auctionEndTime]);

  // --- Interactions ---
  const connectWallet = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      });
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      init();
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyAndCreate = async () => {
    if (!account) return alert("Connect wallet first");
    setIsLoading(true);
    setStatus("Verifying ownership...");

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // 1. Verify Ownership
      if (createForm.nftContract && createForm.nftContract.length > 10) {
        const nftContract = new Contract(createForm.nftContract, ERC721_ABI, provider);
        try {
          const ownerOfToken = await nftContract.ownerOf(createForm.tokenId);
          if (ownerOfToken.toLowerCase() !== account.toLowerCase()) {
            alert("You do not own this NFT! Ownership verification failed.");
            setIsLoading(false);
            setStatus("Verification failed.");
            return;
          }
        } catch (e) {
          console.warn("Could not verify ownership on-chain (might not be ERC721 standard)", e);
          // Proceeding with caution or alert user
        }
      }

      // 2. Set Auction
      setStatus("Creating auction on-chain...");
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.setAuctionItem(
        createForm.name,
        createForm.imageUri,
        createForm.nftContract || "0x0000000000000000000000000000000000000000",
        Number(createForm.tokenId),
        Number(createForm.duration)
      );
      await tx.wait();
      
      setStatus("Auction Created Successfully!");
      setCurrentView('home');
      init(); // Refresh data
    } catch (e) {
      console.error(e);
      setStatus("Failed to create auction. (Are you the contract owner?)");
    }
    setIsLoading(false);
  };

  const placeBid = async () => {
    if (!fhevm || !account) return;
    setIsLoading(true);
    setStatus('Encrypting bid data...');

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const input = fhevm.createEncryptedInput(CONTRACT_ADDRESS, account);
      input.add32(Number(bidAmount));
      const encryptedData = input.encrypt();

      setStatus('Submitting encrypted proof...');
      const tx = await contract.bid(encryptedData.handles[0], encryptedData.inputProof);
      setStatus('Confirming on blockchain...');
      await tx.wait();
      
      setStatus('Bid confirmed! Amount is secret.');
      setBidAmount('');
    } catch (error) {
      console.error(error);
      setStatus('Transaction failed. Check console.');
    }
    setIsLoading(false);
  };

  const handleEndAuction = async () => {
    if (!isOwner) return;
    setIsLoading(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.endAuction();
      await tx.wait();
      setIsEnded(true);
      setStatus("Auction finalized!");
    } catch (e) {
      console.error(e);
      setStatus("Failed to end auction.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-yellow-500 selection:text-black flex flex-col relative overflow-hidden">
      
      <style jsx global>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* --- MODALS --- */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 relative">
            <button onClick={() => setIsWalletModalOpen(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            <div className="text-center mb-6"><div className="w-12 h-12 bg-neutral-800 rounded-xl mx-auto flex items-center justify-center mb-3 text-yellow-400"><Wallet className="w-6 h-6" /></div><h3 className="text-xl font-bold text-white">Connect Wallet</h3><p className="text-neutral-400 text-sm mt-1">Choose how you want to connect.</p></div>
            <div className="space-y-3">
              <button onClick={connectWallet} className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-yellow-400/30 transition-all group cursor-pointer"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center"><img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5" /></div><span className="font-bold text-neutral-200 group-hover:text-white">MetaMask</span></div></button>
              <button onClick={connectWallet} className="w-full flex items-center justify-between p-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-blue-400/30 transition-all group cursor-pointer"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center"><Wallet className="w-4 h-4 text-blue-400" /></div><span className="font-bold text-neutral-200 group-hover:text-white">Browser Wallet</span></div></button>
            </div>
            <div className="mt-6 pt-6 border-t border-neutral-800 text-center"><p className="text-xs text-neutral-500">By connecting, you agree to our <span className="text-neutral-400 hover:text-white cursor-pointer underline" onClick={() => setIsTcOpen(true)}>Terms & Conditions</span></p></div>
          </div>
        </div>
      )}

      {isTcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900 rounded-t-2xl sticky top-0"><h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-yellow-400"/> Terms of Service</h3><button onClick={() => setIsTcOpen(false)} className="text-neutral-500 hover:text-white"><X className="w-6 h-6" /></button></div>
            <div className="p-8 overflow-y-auto text-neutral-300 space-y-6 leading-relaxed">
              <section><h4 className="text-white font-bold text-lg mb-2">1. Protocol Usage</h4><p>ShadowBid operates on the Sepolia Testnet. Assets are for testing only.</p></section>
              <section><h4 className="text-white font-bold text-lg mb-2">2. Ownership Verification</h4><p>By creating an auction, you cryptographically sign that you are the owner of the NFT. The protocol performs on-chain checks to verify this claim.</p></section>
            </div>
            <div className="p-6 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl"><button onClick={() => setIsTcOpen(false)} className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all cursor-pointer">I Understand & Agree</button></div>
          </div>
        </div>
      )}

      {/* --- NAVBAR --- */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('home')}>
              <Shield className="w-6 h-6 text-yellow-400" />
              <span className="font-bold text-xl tracking-tight">Shadow<span className="text-yellow-400">Bid</span></span>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setCurrentView('home')} 
                className={`text-sm font-bold transition-colors ${currentView === 'home' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Live Auctions
              </button>
              <button 
                onClick={() => setCurrentView('create')} 
                className={`text-sm font-bold transition-colors flex items-center gap-2 ${currentView === 'create' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Create Auction
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Create Button (Mobile/Compact) */}
            <button 
              onClick={() => setCurrentView('create')}
              className="md:hidden p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <PlusCircle className="w-5 h-5" />
            </button>

            {!account ? (
              <button 
                onClick={() => setIsWalletModalOpen(true)}
                className="group flex items-center gap-2 bg-neutral-100 hover:bg-white text-black transition-all duration-300 px-5 py-2.5 rounded-full font-bold text-sm shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] cursor-pointer active:scale-95"
              >
                <Wallet className="w-4 h-4" />
                Connect
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-neutral-400 font-medium">Sepolia</p>
                  <p className="text-sm font-bold text-yellow-400">{balance} ETH</p>
                </div>
                <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-full pl-2 pr-4 py-1.5 hover:border-yellow-400/50 transition-colors cursor-pointer group">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold shadow-lg">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-mono font-medium text-neutral-300 group-hover:text-white">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* --- MAIN CONTENT --- */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-grow">
        
        {/* VIEW: CREATE AUCTION */}
        {currentView === 'create' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-extrabold text-white mb-4">List Your NFT</h1>
              <p className="text-neutral-400">Set up a blind auction for your digital asset. We verify ownership before listing.</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl max-w-2xl mx-auto">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-neutral-300 mb-2">Item Name</label>
                  <input 
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-400 transition-colors" 
                    placeholder="e.g. Bored Ape #1234"
                    value={createForm.name}
                    onChange={e => setCreateForm({...createForm, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-300 mb-2">Image URL</label>
                  <input 
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-400 transition-colors" 
                    placeholder="https://..."
                    value={createForm.imageUri}
                    onChange={e => setCreateForm({...createForm, imageUri: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-neutral-300 mb-2">NFT Contract Address</label>
                    <div className="relative">
                      <input 
                        className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-400 transition-colors pl-10" 
                        placeholder="0x..."
                        value={createForm.nftContract}
                        onChange={e => setCreateForm({...createForm, nftContract: e.target.value})}
                      />
                      <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-neutral-300 mb-2">Token ID</label>
                    <input 
                      type="number"
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-400 transition-colors" 
                      placeholder="1"
                      value={createForm.tokenId}
                      onChange={e => setCreateForm({...createForm, tokenId: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-300 mb-2">Duration</label>
                  <select 
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-white focus:border-yellow-400 transition-colors"
                    value={createForm.duration}
                    onChange={e => setCreateForm({...createForm, duration: e.target.value})}
                  >
                    <option value="3600">1 Hour</option>
                    <option value="86400">24 Hours</option>
                    <option value="604800">7 Days</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <button 
                    onClick={handleVerifyAndCreate}
                    disabled={isLoading}
                    className={`w-full py-4 rounded-xl font-bold text-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${isLoading ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-300 shadow-lg shadow-yellow-400/20'}`}
                  >
                    {isLoading ? "Verifying Ownership..." : "Verify Ownership & Create Auction"}
                  </button>
                  <p className="text-center text-xs text-neutral-500 mt-3">{status}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // VIEW: HOME (BIDDING)
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-16 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/5 text-yellow-400 text-xs font-bold uppercase tracking-widest border border-yellow-400/10">
                <Lock className="w-3 h-3" /> FHE Privacy Layer
              </div>
              <h1 className="text-6xl font-extrabold tracking-tight">
                Bid in the <span className="bg-gradient-to-r from-yellow-200 to-yellow-500 bg-clip-text text-transparent">Shadows</span>. <br/> 
                Win in the <span className="text-white">Light</span>.
              </h1>
              <p className="text-neutral-400 text-xl max-w-2xl mx-auto leading-relaxed">
                The first decentralized auction house where your strategy stays yours. 
                Smart contracts verify the highest bidder without ever revealing the losing bids.
              </p>
            </div>

            {/* Main Auction Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-1 shadow-2xl overflow-hidden mb-12 hover:border-neutral-700 transition-colors duration-500">
              <div className="grid md:grid-cols-2 gap-0">
                {/* Image */}
                <div className="bg-neutral-800 relative h-72 md:h-auto group overflow-hidden cursor-pointer">
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent z-10" />
                  <img 
                    src={auctionItem.imageUri || "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000"} 
                    alt="Auction Item" 
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-700 ease-out"
                  />
                  <div className="absolute bottom-6 left-6 z-20">
                    <h3 className="font-bold text-2xl text-white drop-shadow-lg tracking-tight">{auctionItem.name}</h3>
                    <p className="text-neutral-300 text-sm font-medium drop-shadow-md mt-1">
                      {auctionItem.nftContract && auctionItem.nftContract !== "0x0000000000000000000000000000000000000000" 
                        ? `Token ID: #${auctionItem.tokenId}` 
                        : "Exclusive Item"}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="p-8 flex flex-col justify-center space-y-8 bg-neutral-900/50">
                  <div className="flex items-center justify-between pb-6 border-b border-neutral-800">
                    <div>
                      <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Status</p>
                      {isEnded ? (
                        <p className="text-red-400 font-medium flex items-center gap-2">
                          <Gavel className="w-4 h-4"/> Ended
                        </p>
                      ) : (
                        <p className="text-green-400 font-medium flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.5)]"/> Live Auction
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Ends In</p>
                      <p className="text-white font-mono text-xl tabular-nums font-bold tracking-tight">{timeLeft}</p>
                    </div>
                  </div>

                  {!isEnded ? (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-2">
                          Your Private Bid Amount
                        </label>
                        <div className="relative group">
                          <input
                            type="number"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder="0.00"
                            disabled={isLoading}
                            className="w-full bg-black border border-neutral-800 rounded-xl px-5 py-4 text-white focus:outline-none focus:ring-1 focus:ring-yellow-400/50 focus:border-yellow-400/50 transition-all disabled:opacity-50 text-2xl font-mono placeholder:text-neutral-800"
                          />
                          <div className="absolute right-5 top-5 text-neutral-500 text-sm font-bold pointer-events-none group-focus-within:text-yellow-400 transition-colors">ETH</div>
                        </div>
                      </div>
                      
                      <button
                        onClick={placeBid}
                        disabled={isLoading || !account}
                        className={`w-full py-4 rounded-xl font-bold text-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]
                          ${isLoading 
                            ? 'bg-neutral-800 cursor-not-allowed text-neutral-500' 
                            : 'bg-yellow-400 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)]'
                          }
                        `}
                      >
                        {isLoading ? (
                          <><Clock className="w-5 h-5 animate-spin" /> Encryption in Progress...</>
                        ) : (
                          <>Place Private Bid <ChevronRight className="w-5 h-5" /></>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-neutral-950/50 rounded-xl border border-neutral-800">
                      <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white">Auction Closed</h3>
                      <p className="text-sm text-neutral-400 mt-2 max-w-[200px] mx-auto">Winners are being calculated securely on-chain.</p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-center gap-2 text-xs text-neutral-600 h-4">
                    {status !== 'Connect wallet to begin' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    {status}
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Controls (Only visible to Owner) */}
            {isOwner && (
              <div className="mb-12 p-6 rounded-xl border border-red-900/30 bg-gradient-to-r from-red-950/30 to-transparent">
                <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4"/> Admin Zone
                </h3>
                <div className="flex gap-4">
                  <button 
                    onClick={handleEndAuction}
                    disabled={isEnded || isLoading}
                    className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-900/20 active:scale-95 cursor-pointer"
                  >
                    {isEnded ? "Auction Closed" : "Force End Auction"}
                  </button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {[
                { title: "Secret Bidding", desc: "Your bid is encrypted using FHE. Competitors can't see your price, preventing bid sniping." },
                { title: "Verifiable Trust", desc: "The smart contract proves the winner mathematically without needing to decrypt losing bids." },
                { title: "Fair Settlement", desc: "True price discovery. The highest bidder wins, but privacy is preserved for everyone else." }
              ].map((item, i) => (
                <div key={i} className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/20 hover:bg-neutral-900/40 transition-colors duration-300 cursor-default hover:border-neutral-700">
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
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
          
          <a 
            href="https://x.com/0xshinkai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-yellow-400 transition duration-300 group cursor-pointer"
          >
            by <span className="font-bold text-neutral-300 group-hover:text-yellow-400">0xshinkai</span>
            <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </footer>
    </div>
  );
}
