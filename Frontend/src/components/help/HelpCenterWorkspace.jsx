import React from 'react'
import { Book, ExternalLink, MessageCircle, PlayCircle, Search } from 'lucide-react'

export function HelpCenterWorkspace() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Manage</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Help Center</span>
          </div>
          <h2 className="mt-2 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Help Center</h2>
          <p className="mt-1 text-sm text-slate-500">Find answers, tutorials, and contact support.</p>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-slate-900 p-8 text-white sm:p-12">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"></div>
        
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <h3 className="mb-4 text-2xl font-bold sm:text-3xl">How can we help you today?</h3>
          <div className="relative mx-auto max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Search for guides, tutorials, or FAQs..." 
              className="w-full rounded-full border-2 border-slate-700 bg-slate-800/50 py-3 pl-12 pr-6 text-white placeholder-slate-400 outline-none backdrop-blur-sm transition-all focus:border-orange-500 focus:bg-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <HelpCard 
          icon={<Book size={24} />} 
          title="Documentation" 
          description="Read our comprehensive guides and API references."
          color="blue"
        />
        <HelpCard 
          icon={<PlayCircle size={24} />} 
          title="Video Tutorials" 
          description="Watch step-by-step videos to master PrintOps."
          color="orange"
        />
        <HelpCard 
          icon={<MessageCircle size={24} />} 
          title="Community Support" 
          description="Join our Discord to chat with other farm operators."
          color="purple"
        />
      </div>

      {/* FAQs */}
      <div className="panel p-6 sm:p-8">
        <h3 className="mb-6 text-xl font-bold tracking-tight">Frequently Asked Questions</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FaqItem 
            question="How do I add a new printer?" 
            answer="Go to Settings > Network, ensure Auto-Discovery is enabled, and click 'Scan Network' from the Overview page. Make sure your printer is on the same local network."
          />
          <FaqItem 
            question="Can I queue multiple files?" 
            answer="Yes, navigate to the G-Code Storage view and you can queue multiple selected files to be distributed automatically to available printers."
          />
          <FaqItem 
            question="Why is my printer showing as offline?" 
            answer="Check if the printer is powered on and connected to your local network. The PrintOps server requires a stable local connection to communicate with Klipper/OctoPrint instances."
          />
          <FaqItem 
            question="How do I view past prints?" 
            answer="The Activity Log workspace keeps a history of all completed, failed, and canceled print jobs along with their metadata."
          />
        </div>
      </div>

      {/* Contact Support Footer */}
      <div className="mt-8 flex items-center justify-between rounded-xl bg-orange-50 p-6 border border-orange-100">
        <div>
          <h4 className="font-bold text-orange-900">Still need help?</h4>
          <p className="text-sm text-orange-700">Our support team is available 24/7 to assist you.</p>
        </div>
        <button className="primary-button whitespace-nowrap">
          Contact Support <ExternalLink size={14} className="ml-1" />
        </button>
      </div>
    </div>
  )
}

function HelpCard({ icon, title, description, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 group-hover:border-blue-300',
    orange: 'bg-orange-50 text-orange-600 border-orange-100 group-hover:border-orange-300',
    purple: 'bg-purple-50 text-purple-600 border-purple-100 group-hover:border-purple-300',
  }
  return (
    <a href="#" className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-lg">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${colorMap[color]}`}>
        {icon}
      </div>
      <h4 className="mb-2 font-bold text-slate-900">{title}</h4>
      <p className="text-sm text-slate-500">{description}</p>
    </a>
  )
}

function FaqItem({ question, answer }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
      <h5 className="mb-2 font-semibold text-slate-800">{question}</h5>
      <p className="text-sm text-slate-600 leading-relaxed">{answer}</p>
    </div>
  )
}
