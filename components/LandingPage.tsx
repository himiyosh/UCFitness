'use client';

import AuthButtons from './AuthButtons';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-indigo-50 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/2 w-[1000px] h-[1000px] bg-indigo-200/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute top-1/2 -right-1/2 w-[800px] h-[800px] bg-purple-200/20 rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10 w-full max-w-4xl px-6 text-center">
                {/* Logo / Icon */}
                <div className="mx-auto mb-8 w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-200 transform rotate-12 hover:rotate-0 transition-transform duration-500">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>

                <h1 className="text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-6 tracking-tight drop-shadow-sm">
                    UCFitness
                </h1>

                <p className="text-xl sm:text-2xl text-gray-600 mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
                    The ultimate social fitness dashboard for your company.
                    <br />
                    <span className="text-indigo-600 font-bold">Compete</span>, <span className="text-purple-600 font-bold">Collect Badges</span>, and <span className="text-indigo-600 font-bold">Stay Active</span> together.
                </p>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16 text-left">
                    <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-indigo-50 shadow-lg hover:shadow-xl transition-shadow">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-4 text-indigo-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Live Leaderboards</h3>
                        <p className="text-sm text-gray-600">Track your ranking in real-time. See how you stack up against colleagues daily, weekly, and monthly.</p>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-indigo-50 shadow-lg hover:shadow-xl transition-shadow">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4 text-purple-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Group Battles</h3>
                        <p className="text-sm text-gray-600">Join groups and compete team-vs-team. Push your squad to the top of the league.</p>
                    </div>

                    <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-indigo-50 shadow-lg hover:shadow-xl transition-shadow">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-4 text-amber-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Earn Badges</h3>
                        <p className="text-sm text-gray-600">Unlock uniform badges for milestones, streaks, and impressive step counts. Show off your achievements.</p>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="flex flex-col items-center">
                    <div className="scale-125 transform transition-transform hover:scale-130">
                        <AuthButtons />
                    </div>
                    <p className="mt-6 text-sm text-gray-500 font-medium">
                        Connect your Fitbit account to get started instantly.
                    </p>
                </div>
            </div>

            <footer className="absolute bottom-4 text-center text-xs text-gray-400">
                &copy; {new Date().getFullYear()} Studio344
            </footer>
        </div>
    );
}
