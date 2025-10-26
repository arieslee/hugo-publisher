package main

import (
	"fmt"
	"os"
	"testing"
)

func TestListPostsWithSearch(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "hugo_publisher_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	app := &App{}

	// Create test posts with different titles
	testPosts := []struct {
		title       string
		content     string
		description string
	}{
		{"goyuyanbianchengjichu", "Go语言是一门强大的编程语言", "介绍Go语言的基础知识"},
		{"pythonshujufenxi", "使用Python进行数据分析", "Python数据分析教程"},
		{"javascriptqianduankaifa", "前端开发必备技能", "JavaScript学习指南"},
		{"goyuyanbingfabiancheng", "Go语言并发特性详解", "Go并发编程实践"},
		{"reactyingyongkaifa", "使用React构建现代Web应用", "React开发教程"},
	}

	// Create test posts
	for i, post := range testPosts {
		author := "测试作者"
		coverImagePath := ""
		directory := tempDir
		tags := []string{"测试", fmt.Sprintf("标签%d", i)}
		weight := i + 1

		err = app.SavePost(post.title, post.content, post.description, author, coverImagePath, directory, tags, weight)
		if err != nil {
			t.Fatalf("SavePost failed for article %s: %v", post.title, err)
		}
	}

	// Test search functionality
	t.Run("Search", func(t *testing.T) {
		// Test search for "go"
		posts, totalCount, err := app.ListPosts(tempDir, 1, 10, "go")
		if err != nil {
			t.Fatalf("ListPosts failed: %v", err)
		}

		// Should find 2 posts containing "go"
		if totalCount != 2 {
			t.Errorf("Expected total count 2 for search 'go', got %d", totalCount)
		}

		if len(posts) != 2 {
			t.Errorf("Expected 2 posts for search 'go', got %d", len(posts))
		}

		// Test search for "python"
		posts, totalCount, err = app.ListPosts(tempDir, 1, 10, "python")
		if err != nil {
			t.Fatalf("ListPosts failed: %v", err)
		}

		// Should find 1 post containing "python"
		if totalCount != 1 {
			t.Errorf("Expected total count 1 for search 'python', got %d", totalCount)
		}

		if len(posts) != 1 {
			t.Errorf("Expected 1 post for search 'python', got %d", len(posts))
		}

		// Test case-insensitive search
		posts, totalCount, err = app.ListPosts(tempDir, 1, 10, "GO")
		if err != nil {
			t.Fatalf("ListPosts failed: %v", err)
		}

		// Should find 2 posts (case-insensitive)
		if totalCount != 2 {
			t.Errorf("Expected total count 2 for case-insensitive search 'GO', got %d", totalCount)
		}

		// Test search with no results
		posts, totalCount, err = app.ListPosts(tempDir, 1, 10, "不存在的关键词")
		if err != nil {
			t.Fatalf("ListPosts failed: %v", err)
		}

		// Should find 0 posts
		if totalCount != 0 {
			t.Errorf("Expected total count 0 for search '不存在的关键词', got %d", totalCount)
		}

		if len(posts) != 0 {
			t.Errorf("Expected 0 posts for search '不存在的关键词', got %d", len(posts))
		}

		// Test empty search (should return all posts)
		posts, totalCount, err = app.ListPosts(tempDir, 1, 10, "")
		if err != nil {
			t.Fatalf("ListPosts failed: %v", err)
		}

		// Should find all 5 posts
		if totalCount != 5 {
			t.Errorf("Expected total count 5 for empty search, got %d", totalCount)
		}

		if len(posts) != 5 {
			t.Errorf("Expected 5 posts for empty search, got %d", len(posts))
		}
	})

	t.Log("Search tests passed!")
}
