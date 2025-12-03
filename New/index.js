import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom'; // Required for bootstrapping in this environment

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, addDoc, onSnapshot, deleteDoc, doc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';

// Load Tailwind CSS from CDN for styling
const TailwindScript = () => (
  <script src="https://cdn.tailwindcss.com"></script>
);

// --- Global Variables for Canvas Environment ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Initialize Firebase (done outside App to ensure single initialization)
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  console.error("Firebase configuration not found. Firestore will not be operational.");
}


// Main Application Component
const App = () => {
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ name: '', amount: 0, category: 'Food' });
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- 1. Authentication and User ID Setup ---
  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase Authentication Error:", error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(crypto.randomUUID()); 
      }
      setIsLoading(false);
    });

    signIn();
    return () => unsubscribeAuth();
  }, []);

  // --- 2. Real-time Firestore Data Listener ---
  useEffect(() => {
    if (!db || !userId) return; 

    const expensesCollectionPath = `artifacts/${appId}/users/${userId}/expenses`;
    const expensesCollectionRef = collection(db, expensesCollectionPath);

    const unsubscribeSnapshot = onSnapshot(expensesCollectionRef, (snapshot) => {
      const fetchedExpenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      
      setExpenses(fetchedExpenses);
    }, (error) => {
      console.error("Firestore Snapshot Error:", error);
      setMessage(`Error fetching data: ${error.message}`);
    });

    return () => unsubscribeSnapshot();
  }, [db, userId]); 

  const totalExpenses = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewExpense(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value || 0) : value
    }));
  };

  const handleAddExpense = useCallback(async () => {
    if (!db || !userId) {
      setMessage('Error: Database connection not ready.');
      return;
    }
    if (!newExpense.name.trim() || newExpense.amount <= 0) {
      setMessage('Error: Please enter a name and a valid amount.');
      return;
    }

    try {
      const expenseToAdd = {
        name: newExpense.name.trim(),
        amount: newExpense.amount.toFixed(2),
        category: newExpense.category,
        date: new Date().toLocaleDateString(),
        createdAt: serverTimestamp(),
      };

      const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
      await addDoc(expensesCollectionRef, expenseToAdd);
      
      setNewExpense({ name: '', amount: 0, category: 'Food' });
      setMessage('Success! Expense added to Firestore.');

    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage('Error adding expense. Check console.');
    }
  }, [newExpense, db, userId]);

  const handleClearAll = useCallback(async () => {
    if (!db || !userId) return;

    if (expenses.length === 0) {
      setMessage('No expenses to clear.');
      return;
    }

    try {
      const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
      const snapshot = await getDocs(expensesCollectionRef);
      const batch = writeBatch(db);

      snapshot.docs.forEach((d) => {
        batch.delete(d.ref);
      });

      await batch.commit();
      setMessage('All expenses cleared from Firestore.');

    } catch (error) {
      console.error("Error clearing expenses: ", error);
      setMessage('Error clearing all expenses. Check console.');
    }
  }, [expenses.length, db, userId]);

  const handleDeleteExpense = useCallback(async (id) => {
    if (!db || !userId) return;

    try {
      const expenseDocRef = doc(db, `artifacts/${appId}/users/${userId}/expenses`, id);
      await deleteDoc(expenseDocRef);
      setMessage('Expense deleted from Firestore.');
    } catch (error) {
      console.error("Error deleting document: ", error);
      setMessage('Error deleting expense. Check console.');
    }
  }, [db, userId]);

  const categoryColors = {
    Food: 'bg-green-100 text-green-700',
    Housing: 'bg-red-100 text-red-700',
    Transport: 'bg-blue-100 text-blue-700',
    Entertainment: 'bg-purple-100 text-purple-700',
    Other: 'bg-gray-100 text-gray-700',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 via-purple-700 to-pink-500">
        <div className="text-white text-xl font-bold">Loading Expense Tracker...</div>
      </div>
    );
  }

  return (
    <>
      <TailwindScript />
      <div className="min-h-screen bg-gradient-to-br from-indigo-800 via-purple-700 to-pink-500 p-4 sm:p-8 flex justify-center items-start pt-10">
        <div className="w-full max-w-lg bg-white bg-opacity-95 backdrop-blur-sm rounded-xl shadow-2xl p-6 space-y-6">
          <h1 className="text-3xl font-extrabold text-gray-800 text-center">
            💰 Personal Expense Tracker
          </h1>
          <p className="text-center text-xs text-gray-500">
            User ID: {userId} (Private Data Store)
          </p>

          {/* Message Box */}
          {message && (
            <div className={`p-3 rounded-lg text-center font-medium ${message.startsWith('Error') ? 'bg-red-500 text-white' : 'bg-green-100 text-green-700'}`}>
              {message}
            </div>
          )}

          {/* Expense Input Form */}
          <div className="bg-gray-50 p-4 rounded-lg shadow-inner">
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="name">Expense Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={newExpense.name}
                onChange={handleInputChange}
                placeholder="e.g., Groceries, Rent, Coffee"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="amount">Amount ($)</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  value={newExpense.amount}
                  onChange={handleInputChange}
                  min="0.01"
                  step="0.01"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="category">Category</label>
                <select
                  id="category"
                  name="category"
                  value={newExpense.category}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 appearance-none bg-white"
                >
                  {['Food', 'Housing', 'Transport', 'Entertainment', 'Other'].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={handleAddExpense}
                className="flex-1 p-3 text-white font-bold rounded-lg shadow-md bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transition duration-150 transform hover:scale-[1.02]"
              >
                Add Expense
              </button>
              <button
                onClick={handleClearAll}
                className="flex-1 p-3 text-white font-bold rounded-lg shadow-md bg-red-500 hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-500 focus:ring-opacity-50 transition duration-150 transform hover:scale-[1.02]"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Expense List */}
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-700 border-b pb-2">Recent Transactions</h2>
            {expenses.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No expenses recorded yet.</p>
            ) : (
              <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {expenses.map((expense) => (
                  <li key={expense.id} className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition duration-150">
                    <div className="flex flex-col flex-grow">
                      <span className="font-semibold text-gray-800 truncate">{expense.name}</span>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[expense.category] || categoryColors.Other}`}>
                          {expense.category}
                        </span>
                        {expense.date && <span>{expense.date}</span>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-bold text-red-600 whitespace-nowrap">
                        ${expense.amount}
                      </span>
                      <button
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="text-gray-400 hover:text-red-500 transition duration-150 p-1 rounded-full hover:bg-red-50"
                        aria-label="Delete expense"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Total Expenses Summary */}
          <div className="p-4 rounded-xl bg-indigo-500 shadow-lg mt-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-white">Total Expenses</h3>
              <span className="text-3xl font-extrabold text-white">
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-indigo-200 mt-1">
              All expenses are saved permanently in Firestore.
            </p>
          </div>

        </div>
      </div>
    </>
  );
};


// Bootstrap the React application into the document body
const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);

ReactDOM.render(<App />, root);