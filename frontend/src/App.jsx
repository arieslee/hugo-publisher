import {useState} from 'react';
import './App.css';
import MdEditor from 'react-markdown-editor-lite';
import 'react-markdown-editor-lite/lib/index.css';
import { CompressImage, SavePost, SelectDirectory, SelectImageDirectory, SelectGitRepoDirectory, IsValidGitRepo, CommitToGit, InitGitRepo } from "../wailsjs/go/main/App";

function App() {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [coverImage, setCoverImage] = useState(null);
    const [saveDirectory, setSaveDirectory] = useState('');
    const [imageDirectory, setImageDirectory] = useState('');
    const [gitRepoDirectory, setGitRepoDirectory] = useState('');
    
    const handleEditorChange = ({ html, text }) => {
        setContent(text);
    };

    const selectDirectory = async () => {
        try {
            const directory = await SelectDirectory();
            setSaveDirectory(directory);
        } catch (error) {
            console.error('Failed to select directory:', error);
        }
    };

    const selectImageDirectory = async () => {
        try {
            const directory = await SelectImageDirectory();
            setImageDirectory(directory);
        } catch (error) {
            console.error('Failed to select image directory:', error);
        }
    };

    const selectGitRepoDirectory = async () => {
        try {
            const directory = await SelectGitRepoDirectory();
            // Check if the selected directory is a valid git repository
            const isValid = await IsValidGitRepo(directory);
            if (!isValid) {
                alert('所选目录不是有效的 Git 仓库（不包含 .git 文件夹）');
                return;
            }
            setGitRepoDirectory(directory);
        } catch (error) {
            console.error('Failed to select git repo directory:', error);
        }
    };

    const initGitRepo = async () => {
        if (!saveDirectory) {
            alert('请先选择保存目录');
            return;
        }

        try {
            await InitGitRepo(saveDirectory);
            alert('Git 仓库初始化成功！');
        } catch (error) {
            console.error('Failed to initialize git repo:', error);
            let errorMessage = '未知错误';
            if (error.message) {
                errorMessage = error.message;
                if (errorMessage.includes('already a git repository')) {
                    errorMessage = '该目录已经是 Git 仓库了';
                }
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            alert('初始化失败：' + errorMessage);
        }
    };

    const publishPost = async () => {
        if (!title || !content || !saveDirectory) {
            alert('请填写标题、内容并选择保存目录');
            return;
        }

        try {
            // If there's a cover image, compress and save it
            let coverImagePath = '';
            if (coverImage && imageDirectory) {
                // Generate a unique filename for the image
                const timestamp = new Date().getTime();
                const imageName = `cover-${timestamp}${getFileExtension(coverImage.name)}`;
                const imagePath = `${imageDirectory}/${imageName}`;
                
                // In a full implementation, we would handle image upload here
                // For now, we'll just note that the image should be saved
                coverImagePath = imagePath;
            }

            // Save the post
            await SavePost(title, content, coverImagePath, saveDirectory);
            
            // Get the filename that was created
            const currentDate = new Date().toISOString().split('T')[0];
            // Replace spaces and special characters in title for filename
            const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-');
            const filename = `${currentDate}-${safeTitle}.md`;
            
            // Commit to git
            if (gitRepoDirectory) {
                // Use the selected git repo directory
                await CommitToGit(gitRepoDirectory, filename);
            } else {
                // Fallback to save directory
                await CommitToGit(saveDirectory, filename);
            }
            
            alert('文章发布成功并已提交到Git！');
        } catch (error) {
            console.error('Failed to publish post:', error);
            // Provide more detailed error information
            let errorMessage = '未知错误';
            if (error.message) {
                errorMessage = error.message;
                // Provide user-friendly error messages for common git issues
                if (errorMessage.includes('git add failed') && errorMessage.includes('128')) {
                    errorMessage = 'Git 操作失败：请选择一个已初始化的 Git 仓库目录，或在该目录中运行 "git init" 初始化仓库。';
                } else if (errorMessage.includes('directory is not a git repository')) {
                    errorMessage = '所选目录不是 Git 仓库：请选择一个已初始化的 Git 仓库目录。';
                }
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            alert('发布失败：' + errorMessage);
        }
    };

    // Helper function to get file extension
    const getFileExtension = (filename) => {
        return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
    };

    return (
        <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
            <div className="relative py-3 w-full px-4 sm:px-6 lg:px-8">
                <div className="relative bg-white shadow rounded-3xl overflow-hidden">
                    <div className="w-full mx-auto">
                        <div className="flex items-center space-x-5 p-4 sm:p-6 md:p-8">
                            <div className="block pl-2 font-semibold text-xl self-start text-gray-700">
                                <h2 className="leading-relaxed">Hugo 内容发布</h2>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-200 px-4 sm:px-6 md:px-8">
                            <div className="py-6 sm:py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 text-sm mb-1 block">标题</label>
                                        <input 
                                            type="text" 
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="border border-gray-300 px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="请输入文章标题"
                                        />
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 text-sm mb-1 block">封面图片</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <input 
                                                type="file" 
                                                accept="image/*"
                                                onChange={(e) => setCoverImage(e.target.files[0])}
                                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                            <div className="flex w-full sm:w-auto">
                                                <input 
                                                    type="text" 
                                                    value={imageDirectory}
                                                    readOnly
                                                    className="border border-gray-300 px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="图片保存目录"
                                                />
                                                <button 
                                                    onClick={selectImageDirectory}
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap ml-2"
                                                >
                                                    选择
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 text-sm mb-1 block">保存目录</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <input 
                                                type="text" 
                                                value={saveDirectory}
                                                readOnly
                                                className="border border-gray-300 px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="请选择保存目录"
                                            />
                                            <div className="flex space-x-2">
                                                <button 
                                                    onClick={selectDirectory}
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap"
                                                >
                                                    选择
                                                </button>
                                                <button 
                                                    onClick={initGitRepo}
                                                    className="bg-green-200 hover:bg-green-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap"
                                                    disabled={!saveDirectory}
                                                >
                                                    初始化Git
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 text-sm mb-1 block">Git 仓库目录</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <input 
                                                type="text" 
                                                value={gitRepoDirectory}
                                                readOnly
                                                className="border border-gray-300 px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="请选择包含 .git 文件夹的目录"
                                            />
                                            <button 
                                                onClick={selectGitRepoDirectory}
                                                className="bg-purple-200 hover:bg-purple-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap"
                                            >
                                                选择 Git 仓库
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <label className="font-medium text-gray-600 text-sm mb-1 block">内容</label>
                                    <MdEditor 
                                        value={content} 
                                        style={{ height: '400px' }}
                                        className="w-full"
                                        onChange={handleEditorChange}
                                        renderHTML={(text) => <div dangerouslySetInnerHTML={{ __html: text }} />}
                                    />
                                </div>
                                <div className="pt-4 flex items-center space-x-4">
                                    <button 
                                        className="bg-blue-500 flex justify-center items-center w-full text-white px-4 py-3 rounded-md focus:outline-none hover:bg-blue-600 transition duration-300"
                                        onClick={publishPost}
                                    >
                                        发布
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
