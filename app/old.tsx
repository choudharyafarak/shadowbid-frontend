'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { createInstance, FhevmInstance } from 'fhevmjs';
import { Shield, Lock, Wallet, ChevronRight, Gavel, Clock, Trophy, ExternalLink } from 'lucide-react';

const CONTRACT_ADDRESS = "0xbddf8F38B8e7E76B118932E338426194BcC51f3e";

const ABI = [
  "function bid(bytes calldata input, bytes calldata inputProof) public",
  "function endTime() public view returns (uint256)",
  "function isEnded() public view returns (bool)",
  "function owner() public view returns (address)",
  "function endAuction() public",
  "function getWinningBid() public view returns (uint256, address)"
];

export default function ShadowBidApp() {
  const [account, setAccount] = useState<string | null>(null);
  const [fhevm, setFhevm] = useState<FhevmInstance | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [status, setStatus] = useState('Connect your wallet to start');
  const [isLoading, setIsLoading] = useState(false);
  
  // Auction State
  const [auctionEndTime, setAuctionEndTime] = useState<number>(0);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<string>("Loading...");

  // Initialize & Fetch Data
  const init = useCallback(async () => {
    if (!window.ethereum) return;
    const provider = new BrowserProvider(window.ethereum);
    
    // 1. Setup Contract for Reading
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
    
    try {
      // Fetch static data
      const endT = await contract.endTime();
      const ended = await contract.isEnded();
      setAuctionEndTime(Number(endT));
      setIsEnded(ended);

      // Check ownership
      const signer = await provider.getSigner();
      const userAddr = await signer.getAddress();
      const ownerAddr = await contract.owner();
      
      setAccount(userAddr);
      setIsOwner(userAddr.toLowerCase() === ownerAddr.toLowerCase());

      // 2. Setup FHEVM
      const instance = await createInstance({ chainId: 11155111 });
      setFhevm(instance);
      setStatus('Ready to bid securely');
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
        setIsEnded(true); // Optimistic update
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [auctionEndTime]);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Please install MetaMask!");
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }], // Sepolia
      });
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      init();
    } catch (e) {
      console.error(e);
    }
  };

  const placeBid = async () => {
    if (!fhevm || !account) return;
    setIsLoading(true);
    setStatus('Encrypting your bid...');

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const input = fhevm.createEncryptedInput(CONTRACT_ADDRESS, account);
      input.add32(Number(bidAmount));
      const encryptedData = input.encrypt();

      setStatus('Sending encrypted transaction...');
      const tx = await contract.bid(encryptedData.handles[0], encryptedData.inputProof);
      setStatus('Waiting for block confirmation...');
      await tx.wait();
      
      setStatus('Bid placed successfully! Your amount is hidden.');
      setBidAmount('');
    } catch (error) {
      console.error(error);
      setStatus('Transaction failed. See console.');
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
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-yellow-500 selection:text-black flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-yellow-400" />
            <span className="font-bold text-xl tracking-tight">Shadow<span className="text-yellow-400">Bid</span></span>
          </div>
          <button 
            onClick={connectWallet}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 transition px-4 py-2 rounded-full text-sm font-medium border border-neutral-700"
          >
            <Wallet className="w-4 h-4" />
            {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12 flex-grow">
        
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-semibold uppercase tracking-wide border border-yellow-400/20">
            <Lock className="w-3 h-3" /> Zama FHE Powered
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            The World's First <br/> Encrypted Auction House
          </h1>
          <p className="text-neutral-400 text-lg max-w-xl mx-auto">
            Place bids on high-value assets without revealing your price. 
            Smart contracts mathematically determine the winner while keeping all data fully private.
          </p>
        </div>

        {/* Main Auction Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-1 shadow-2xl overflow-hidden mb-12">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Image Section */}
            <div className="bg-neutral-800 relative h-64 md:h-auto group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent z-10" />
              <img 
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop" 
                alt="Auction Item" 
                className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
              />
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-bold text-xl text-white">CyberPunk #2077</h3>
                <p className="text-neutral-400 text-sm">Rare Digital Collectible</p>
              </div>
            </div>

            {/* Interaction Section */}
            <div className="p-8 flex flex-col justify-center space-y-6 bg-neutral-900/50">
              <div className="flex items-center justify-between pb-6 border-b border-neutral-800">
                <div>
                  <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Status</p>
                  {isEnded ? (
                     <p className="text-red-400 font-medium flex items-center gap-1 mt-1">
                       <Gavel className="w-4 h-4"/> Auction Ended
                     </p>
                  ) : (
                    <p className="text-green-400 font-medium flex items-center gap-1 mt-1">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/> Live Now
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Time Remaining</p>
                  <p className="text-white font-mono text-lg mt-1 tabular-nums">{timeLeft}</p>
                </div>
              </div>

              {!isEnded ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-neutral-300">
                    Your Confidential Bid (ETH)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={isLoading}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 transition disabled:opacity-50"
                    />
                    <div className="absolute right-4 top-3.5 text-neutral-600 text-sm font-bold">ETH</div>
                  </div>
                  
                  <button
                    onClick={placeBid}
                    disabled={isLoading || !account}
                    className={`w-full py-4 rounded-lg font-bold text-black transition flex items-center justify-center gap-2
                      ${isLoading ? 'bg-neutral-700 cursor-not-allowed text-neutral-400' : 'bg-yellow-400 hover:bg-yellow-300 hover:scale-[1.02]'}
                    `}
                  >
                    {isLoading ? 'Processing...' : <>Place Private Bid <ChevronRight className="w-5 h-5" /></>}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 bg-neutral-950/50 rounded-xl border border-neutral-800">
                  <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-white">Bidding Closed</h3>
                  <p className="text-sm text-neutral-400">The winner is being determined cryptographically.</p>
                </div>
              )}
              
              <p className="text-center text-xs text-neutral-600 mt-2 h-4">
                {status}
              </p>
            </div>
          </div>
        </div>

        {/* Admin Dashboard (Only visible to Owner) */}
        {isOwner && (
          <div className="mb-12 p-6 rounded-xl border border-red-900/30 bg-red-900/10">
            <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4"/> Admin Controls
            </h3>
            <div className="flex gap-4">
              <button 
                onClick={handleEndAuction}
                disabled={isEnded || isLoading}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEnded ? "Auction Already Ended" : "End Auction Now"}
              </button>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "Encrypted State", desc: "Bids are stored as euint32 types. Not even the blockchain validators can see them." },
            { title: "Fair Play", desc: "No front-running or bid sniping. Everyone bids blindly." },
            { title: "Verifiable", desc: "Mathematical proofs ensure the highest number wins without revealing the number." }
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 hover:bg-neutral-900/50 transition">
              <h3 className="font-bold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer with Credit */}
      <footer className="border-t border-neutral-800 py-8 mt-12 bg-neutral-900/30">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center text-sm text-neutral-500">
          <p>&copy; 2025 ShadowBid. All rights reserved.</p>
          <a 
            href="https://x.com/0xshinkai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-yellow-400 transition duration-300 group"
          >
            by <span className="font-bold text-neutral-300 group-hover:text-yellow-400">0xshinkai</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
